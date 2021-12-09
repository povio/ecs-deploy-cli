import { dockerCommand } from "docker-cli-js";
import cli from "./cli.helper";

const options = {
  echo: false,
};

class Docker {
  public enabled: boolean;
  public _version: string;

  async init() {
    try {
      this._version = (await dockerCommand("--version", options)).raw
        .replace(/"|\\n/, "")
        .trim();
      this.enabled = true;
    } catch (e) {
      if (process.env.VERBOSE) {
        cli.error(e.toString());
      }
      this.enabled = false;
      return "n/a";
    }
    return this._version;
  }
}

export default new Docker();
