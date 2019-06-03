import Field from "@prisma/dmmf/dist/Field";

export type Dictionary<T> = Record<string, T>;

export interface RelationConstraints {
  atMax(amount: number): FixtureConstraint;
  atLeastIfExisting(amount: number): FixtureConstraint;
}

export interface FixtureBuilder {
  faker: Faker.FakerStatic;
  constraints: RelationConstraints;
}

export type FixtureFieldDefition = Dictionary<
  string | number | FixtureConstraint
>;
export type FixtureDynamic = {
  amount?: number;
  factory?: () => FixtureFieldDefition;
};
export type FixtureStatic = Array<Dictionary<any>> | Dictionary<any>;

export type FixtureDefinition = FixtureDynamic;

export interface FixtureConstraint {
  type: "AT_MAX" | "AT_LEAST_IF_EXISTING";
  value: number;
}

export interface FixtureRelation {
  field: Field;
  ids: () => number[];
}

export interface IntermediateFixture {
  id: number;
  modelName: string;
  createMethod: string;
  updateMethod: string;
  scalars: Dictionary<string | number | boolean>;
  relations: FixtureRelation[];
}
