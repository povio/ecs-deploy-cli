import { dockerCommand } from "docker-cli-js";
import cli from "./cli.helper";

const options = {
  echo: false,
};

class Docker {
  public enabled = true;

  async version(): Promise<string> {
    try {
      return (await dockerCommand("--version", options)).raw
        .replace(/"|\\n/, "")
        .trim();
    } catch (e) {
      if (process.env.VERBOSE) {
        cli.error(e.toString());
      }
      // todo, check this without .version()
      this.enabled = false;
      return "n/a";
    }
  }
}

export default new Docker();
