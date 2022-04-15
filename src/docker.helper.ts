import { exec } from "child_process";

interface CommandOptions {
  verbose?: boolean;
  stdin?: string;
  dryRun?: boolean;
  mockResponse?: string;
}

interface CommandResponse<T> {
  raw?: string;
  data?: T;
  execCommand: string;
  execOptions?: any;
  error?: any;
}

export class Docker {
  private cwd: string;
  private verbose: boolean;
  private env: Record<string, string>;

  constructor(
    options: {
      cwd?: string;
      env?: Record<string, string>;
      verbose?: boolean;
    } = {}
  ) {
    this.cwd = options.cwd || process.cwd();
    this.env = options.env || {};
    this.verbose = !!options.verbose;
  }

  public async version(
    options?: CommandOptions
  ): Promise<CommandResponse<string>> {
    return this.handleResponse(
      "version --format '{{json .}}'",
      options,
      (response) => {
        const data = JSON.parse(response.raw);
        return `Client ${data.Client.Version} Server ${data.Server.Version}`;
      }
    );
  }

  public async login(
    data: {
      serveraddress?: string;
      username: string; // todo escape this
      password: string;
      // email?: string;
    },
    options?: CommandOptions
  ) {
    return this.handleResponse(
      `login --username ${data.username} --password-stdin ${data.serveraddress}`,
      { ...options, stdin: data.password },
      (response) => {
        if (/Login Succeeded/.test(response.raw)) return true;
        throw new Error("Invalid response while logging in");
      }
    );
  }

  public async logout(
    data: {
      serveraddress?: string;
    },
    options?: CommandOptions
  ) {
    return this.handleResponse(
      `logout  ${data.serveraddress}`,
      options,
      (response) => {
        return;
      }
    );
  }

  public async imagePull(imageName: string, options?: CommandOptions) {
    return this.handleResponse(`pull ${imageName}`, options, (response) => {
      return undefined;
    });
  }

  public async imageExists(imageName: string, options?: CommandOptions) {
    return this.handleResponse(
      `image inspect ${imageName} --format="found"`,
      options,
      (response) => {
        return /found/.test(response.raw);
      },
      (e) => {
        if (/No such image/.test(e.message)) {
          return false;
        }
        throw e;
      }
    );
  }

  public async imageBuild(
    buildOptions: {
      context: string;
      src: string[];
      imageName: string;
      previousImageName?: string;
      buildargs?: { [key: string]: string };
      noCache?: boolean;
      buildx?: boolean;
      platform?: string;
      push: boolean;
    },
    options?: CommandOptions
  ) {
    if (buildOptions.buildx) {
      await this.execute("buildx install");
      await this.execute("buildx create --name ecs-build --use");
    }

    try {
      let command = buildOptions.buildx ? "buildx build " : "build ";

      command += `--progress plain -t "${buildOptions.imageName} `;

      if (buildOptions.platform) {
        command += `--platform ${buildOptions.platform} `;
      }

      for (const s of buildOptions.src) {
        command += `-f ${s} `;
      }

      for (const [k, v] of Object.entries(buildOptions.buildargs || {})) {
        command += `--build-arg ${k}="${v}" `;
      }

      if (buildOptions.noCache) {
        command += "--no-cache ";
      }

      if (buildOptions.previousImageName) {
        command += `--cache-from ${buildOptions.previousImageName} "`;
      }

      command += buildOptions.context ?? process.cwd();

      if (buildOptions.push) {
        command += " --push";
      }

      return this.handleResponse(command, options, (response) => {
        return undefined;
      });
    } catch (e) {
      throw e;
    } finally {
      if (buildOptions.buildx) {
        await this.execute("buildx rm ecs-build");
      }
    }
  }

  public async imagePush(imageName: string, options?: CommandOptions) {
    return this.handleResponse(`push ${imageName}`, options, (response) => {
      return undefined;
    });
  }

  private async handleResponse<T>(
    execCommand: string,
    options: CommandOptions = {},
    parser: (rawResponse: CommandResponse<undefined>) => T,
    onError?: (e: any) => T
  ): Promise<CommandResponse<T>> {
    let response: CommandResponse<any> = { execCommand };
    try {
      // dry run and unit tests
      if (options.dryRun || options.mockResponse) {
        return {
          execCommand,
          raw: options.mockResponse,
          data:
            options.mockResponse && !options.dryRun
              ? parser({ execCommand, raw: options.mockResponse })
              : undefined,
        };
      }

      // execute docker command and parse response
      response = await this.execute(execCommand, options);
      return {
        ...response,
        data: parser(response),
      };
    } catch (e) {
      e.response = response;
      if (onError) {
        return {
          ...response,
          error: e,
          data: onError(e),
        };
      }
      throw e;
    }
  }

  private async execute(
    execCommand: string,
    options: CommandOptions = {}
  ): Promise<CommandResponse<undefined>> {
    const execOptions = {
      cwd: this.cwd,
      env: {
        DEBUG: "",
        HOME: process.env.HOME,
        PATH: process.env.PATH,
        ...(this.env ? this.env : {}),
      },
      maxBuffer: 200 * 1024 * 1024,
    };

    const raw: string = await new Promise((resolve, reject) => {
      if (this.verbose) {
        console.log(`[DOCKER] docker ${execCommand}`);
      }

      const childProcess = exec(
        `docker ${execCommand}`,
        execOptions,
        (error, stdout, stderr) => {
          if (error) {
            return reject(
              Object.assign(
                new Error(`Error: stdout ${stdout}, stderr ${stderr}`),
                { ...error, stdout, stderr, innerError: error }
              )
            );
          }

          resolve(stdout);
        }
      );

      if (options.stdin) {
        childProcess.stdin.write(options.stdin);
        childProcess.stdin.end();
      }

      if (this.verbose || options.verbose) {
        childProcess.stdout.on("data", (chunk) => {
          process.stdout.write(chunk.toString());
        });

        childProcess.stderr.on("data", (chunk) => {
          process.stderr.write(chunk.toString());
        });
      }
    });

    return {
      raw,
      data: undefined,
      execCommand: execCommand,
      execOptions: execOptions,
    };
  }
}
