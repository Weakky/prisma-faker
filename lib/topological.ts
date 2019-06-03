import Field from "@prisma/dmmf/dist/Field";
import {
  DatabaseType,
  DefaultParser,
  IGQLField,
  IGQLType,
  ISDL
} from "prisma-datamodel";
const toposort = require("toposort");

type Dictionary<T> = Record<string, T>;

const self = `
type A {
  id: ID! @id
  a: A!
}
`;

const required_both_side = `
type A {
  id: ID! @id
  b: B!
}
type B {
  id: ID! @id
  a: A!
}
`;

const simple = `
type A {
  id: ID! @id
  b: B!
}
type B {
  id: ID! @id
  c: C!
}
type C {
  id: ID! @id
  name: String!
  d: D!
}
type D {
  id: ID! @id
}

type E {
  id: ID! @id
  f: F!
}

type F {
  id: ID! @id
}
`;

const blog = `
type User {
  id: ID! @id
  posts: [Post]
}

type Post {
  id: ID! @id
  comments: [Comment]
  author: User!
}

type Comment {
  id: ID! @id
  author: User!
}

type Blog {
  id: ID! @id
  posts: [Post]
}


type Configuration {
  id: ID! @id
  configurationLines: [ConfigurationLine]
}

type ConfigurationLine {
  id: ID! @id
}
`;

function convertDatamodelToDAF(datamodel: ISDL) {
  const graph: string[][] = [];
  const marked: Dictionary<boolean> = {};

  datamodel.types.forEach(type => {
    const relations = type.fields.filter(
      field => typeof field.type !== "string"
    ) as IGQLField[];

    marked[type.name] = true;

    for (const relation of relations) {
      const relationType = relation.type as IGQLType;

      graph.push([type.name, relationType.name]);
    }
  });

  console.log(graph);
  console.log(toposort(graph));
}

function buildOrder(schema: string) {
  const parser = DefaultParser.create(DatabaseType.postgres);
  const datamodel = parser.parseFromSchemaString(schema);

  convertDatamodelToDAF(datamodel);
}

buildOrder(blog);
