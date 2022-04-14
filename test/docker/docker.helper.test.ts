import path from "path";

import { Docker } from "../../src/docker.helper";

describe("docker", () => {
  test("it should make the correct docker commands", async () => {
    const docker = new Docker({ cwd: path.join(__dirname, "..") });

    //expect(() => {}).toThrow("Tried to override config structure with env");

    expect(
      (
        await docker.version({
          mockResponse: JSON.stringify({
            Client: {
              Version: "1.1.1",
            },
            Server: {
              Version: "1.2.1",
            },
          }),
        })
      ).data
    ).toEqual("Client: 1.1.1");

    expect(
      (
        await docker.login(
          { serveraddress: "localhost", username: "usr", password: "pss" },
          { dryRun: true }
        )
      ).execCommand
    ).toEqual("login --username usr --password-stdin localhost");
  });
});
