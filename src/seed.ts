import { PrismaFaker } from "../lib";

run();

async function run() {
  const prismaFaker = new PrismaFaker(p => ({
    User: {
      factory: () => ({
        name: p.faker.name.firstName(),
        posts: p.constraints.atMax(2)
      })
    }
  }));

  const fixtures: any = prismaFaker.getFixtures();

  console.log(fixtures);
}
