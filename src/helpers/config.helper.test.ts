import { test } from "node:test";
import { resolveBootstrapConfigItem } from "./config.helper";

test("test", async () => {
  const config = await resolveBootstrapConfigItem(
    {
      name: "test",
      destination: "./.config/myapp-dev.backend.yml",
      values: [
        { name: "database__name", value: "test" },
        { name: "database__username2", value: "test" },
        { name: "database__password", valueFrom: "env:PWD" },
        {
          name: "@",
          configFrom: "backend.template",
        },
        //{
        //  name: "@",
        //  treeFrom: "arn:aws:ssm:::parameter/myapp-dev/",
        //},
      ],
    },
    {
      accountId: "000000000000",
      region: "us-east-1",
    },
    "./test",
    "myapp-dev",
  );

  console.log(config);
});
