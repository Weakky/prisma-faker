import { DMMF } from "@prisma/dmmf";
import Field from "@prisma/dmmf/dist/Field";
import Model from "@prisma/dmmf/dist/Model";
import * as faker from "faker";
import { Dictionary } from "lodash";
import * as seedrandom from "seedrandom";
import uuidv4 from "uuid/v4";
import { findDatamodelAndComputeSchema, readPrismaYml } from "./datamodel";
import { RelationalIDGenerator } from "./id-generators/relational";
import { IDGenerator } from "./id-generators/types";
import {
  FixtureBuilder,
  FixtureConstraint,
  FixtureDefinition,
  FixtureDynamic,
  FixtureRelation,
  FixtureStatic,
  IntermediateFixture,
  RelationConstraints
} from "./types";
import { sampleSize } from "./utils";

const CONSTRAINTS: RelationConstraints = {
  atLeastIfExisting(number) {
    return {
      type: "AT_LEAST_IF_EXISTING",
      value: number
    };
  },
  atMax(number) {
    return {
      type: "AT_MAX",
      value: number
    };
  }
};
const DEFAULT_AMOUNT = 5;
const DEFAULT_CONSTRAINT = CONSTRAINTS.atMax(5);

function isFixtureLambda(obj: FixtureDefinition): obj is FixtureDynamic {
  return obj && typeof obj === "function";
}

function isFixtureConstraint(obj: any): obj is FixtureConstraint {
  return obj && obj.type;
}

export class PrismaFaker {
  protected dmmf: DMMF;
  protected models: Dictionary<FixtureDefinition>;
  protected idGenerator: IDGenerator<any>;
  protected internalIdGenerator: RelationalIDGenerator;
  protected idMap: Dictionary<string[]>;

  constructor(
    models?: (p: FixtureBuilder) => Dictionary<FixtureDefinition>,
    opts: { seed?: number; generator?: IDGenerator<any> } = {
      seed: 42,
      generator: new RelationalIDGenerator()
    }
  ) {
    const prisma = readPrismaYml();
    this.dmmf = findDatamodelAndComputeSchema(prisma.configPath, prisma.config);

    if (!opts.seed) {
      opts.seed = 42;
    }

    if (!opts.generator) {
      opts.generator = new RelationalIDGenerator();
    }

    // Set seeds to have deterministic seeding
    faker.seed(opts.seed);
    seedrandom(opts.seed.toString(), { global: true });

    if (models) {
      this.models = models({ faker, constraints: CONSTRAINTS });
    } else {
      this.models = {};
    }

    this.idGenerator = opts.generator;
    this.internalIdGenerator = new RelationalIDGenerator();
    this.idMap = {};
    this.dmmf.datamodel.models.forEach(model => {
      this.idMap[model.name] = [];
    });
  }

  getFixtures() {
    const { dataMap, fixtureMap } = this.generateFixtureMap();

    const output = Object.entries(fixtureMap).reduce<Dictionary<any[]>>(
      (acc, value) => {
        const [fixtureId, fixtureDef] = value;
        const modelName = fixtureDef.modelName;

        if (!acc[modelName]) {
          acc[modelName] = [];
        }

        acc[modelName].push(dataMap[fixtureId]);

        return acc;
      },
      {}
    );

    return output;
  }

  /**
   * Seed the database based on the generated fixtures
   * @param photon
   */
  async seedDatabase(photon: any) {
    // TODO: Perform a topological sort on the datamodel to know the order in which we need to seed the database
    const { fixtureMap } = this.generateFixtureMap();

    for (const fixtureId in fixtureMap) {
      const fixture = fixtureMap[fixtureId];

      console.log(`Seeding ${fixture.modelName} -> ${fixtureId}`);

      let data = {
        ...fixture.scalars
      };

      await photon[fixture.createMethod](data);
    }

    for (const fixtureId in fixtureMap) {
      const fixture = fixtureMap[fixtureId];

      await photon[fixture.updateMethod]({
        where: { id: fixture.id },
        data: {
          ...fixture.relations.reduce<Dictionary<any>>((acc, relation) => {
            const ids = relation.ids();

            if (relation.field.isList) {
              acc[relation.field.name] = { connect: ids.map(id => ({ id })) };
            } else {
              acc[relation.field.name] = { connect: ids[0] };
            }

            return acc;
          }, {})
        }
      });
    }
  }

  private generateFixtureMap(): {
    fixtureMap: Dictionary<IntermediateFixture>;
    dataMap: Dictionary<Record<string, any>>;
  } {
    const fixtureMap: Dictionary<IntermediateFixture> = {};
    const dataMap: Dictionary<any> = {};

    this.dmmf.datamodel.models.forEach(model => {
      const defaultFixture = this.getDefaultFixture(model);
      const fixture =
        this.models[model.name] === undefined
          ? defaultFixture
          : this.models[model.name];

      const amount = fixture.amount ? fixture.amount : DEFAULT_AMOUNT;
      const factoryFn = fixture.factory
        ? fixture.factory
        : defaultFixture.factory!;

      for (let j = 0; j < amount; j++) {
        const evalFixture = factoryFn();
        const scalars: Dictionary<string | number> = {};
        const relations: FixtureRelation[] = [];

        model.fields.forEach(field => {
          if (evalFixture[field.name] === undefined) {
            evalFixture[field.name] = this.generateRandomField(model, field);
          }

          if (field.isScalar()) {
            scalars[field.name] = evalFixture[field.name] as string | number;
          } else {
            relations.push({
              field,
              ids: () =>
                this.constraintToIds(field.type, evalFixture[
                  field.name
                ] as FixtureConstraint)
            });
          }
        });

        const id = this.setInternalIdMap(model.name);

        dataMap[id.toString()] = {
          ...scalars,
          ...relations.reduce<Dictionary<any>>((acc, relation) => {
            acc[relation.field.name] = () => {
              const relationData = relation
                .ids()
                .map(id => dataMap[id.toString()]);
              if (relation.field.isList) {
                return relationData;
              }

              return relationData[0];
            };
            return acc;
          }, {})
        };

        const photonMapping = this.dmmf.mappings.find(
          m => m.model === model.name
        )!;

        fixtureMap[id.toString()] = {
          modelName: model.name,
          id,
          createMethod: photonMapping.create,
          updateMethod: photonMapping.update,
          scalars,
          relations
        };
      }
    });

    // Evaluate relations
    Object.keys(dataMap).forEach(fixtureId => {
      const data = dataMap[fixtureId];

      Object.keys(data).forEach(fieldName => {
        if (typeof data[fieldName] === "function") {
          dataMap[fixtureId][fieldName] = dataMap[fixtureId][fieldName]();
        }
      });
    });

    return { fixtureMap, dataMap };
  }

  // Compute the relationds ids based on the defined constraint
  private constraintToIds(
    fieldType: string,
    constraint: FixtureConstraint = DEFAULT_CONSTRAINT
  ): Array<any> {
    const idList = this.idMap[fieldType];

    if (!idList) {
      throw new Error(
        `constraintToIds: Could not find relation for type: ${fieldType}`
      );
    }

    let idsAmount = 0;
    const relationAmount = idList.length;

    if (constraint.type === "AT_LEAST_IF_EXISTING") {
      if (relationAmount >= constraint.value) {
        idsAmount = relationAmount;
      } else {
        idsAmount = constraint.value;
      }
    } else {
      if (relationAmount >= constraint.value) {
        idsAmount = constraint.value;
      } else {
        idsAmount = relationAmount;
      }
    }

    return sampleSize(idList, idsAmount);
  }

  private getDefaultFixture(model: Model): FixtureDynamic {
    return {
      amount: DEFAULT_AMOUNT,
      factory: () => {
        return model.fields.reduce<Dictionary<any>>((acc, field) => {
          acc[field.name] = this.generateRandomField(model, field);
          return acc;
        }, {});
      }
    };
  }

  private generateRandomField(model: Model, field: Field) {
    if (field.isUnique) {
      switch (field.type) {
        case "ID":
          return this.idGenerator.generate();

        case "String":
          return uuidv4();

        default:
          throw new Error(
            `Unique field not supported. ${model.name}.${field.name}: ${
              field.type
            }`
          );
      }
    }

    if (field.isScalar()) {
      switch (field.type) {
        case "String":
          return faker.random.word();

        case "Int":
          return Math.round(faker.random.number({ min: 1, max: 100 }));

        case "Float":
          return faker.random.number({ min: 1, max: 100 });

        case "Date":
          return faker.date.recent();
      }
    }

    return DEFAULT_CONSTRAINT;
  }

  private setInternalIdMap(modelName: string): number {
    const id = this.internalIdGenerator.generate();
    this.idMap[modelName].push(id.toString());
    return id;
  }
}
