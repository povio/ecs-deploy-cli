import {
  loadEnvironmentIntoConfig,
  Config,
  loadConfig,
} from "../../src/config.helper";

describe("config", () => {
  test("it should load environment into config", () => {
    const config: Config = {
      override_existing: "old",
      override_existing_deep: {
        original: "value",
        nested: {
          example: "old",
        },
      },
      add_to_deep: {
        original: "value",
      },
      environment: {
        example: "thing",
      },
      env_files: [".env.stage"],
    };

    loadEnvironmentIntoConfig(config, {
      // override existing variable
      app__override_existing: "new",
      app__override_existing_deep__nested__example: "new",

      // add to a deep variable
      app__add_to_deep__thing: "thingy",

      // built in constructs should be ignored
      app__environment: "this should not override",
      app__env_files: "this should not override",

      // define a new variable
      app__new_variable: "thingy",
      // define a new deep variable
      app__new_deep_variable__thing: "thingy",
    });

    expect(config).toEqual({
      override_existing: "new",
      override_existing_deep: { nested: { example: "new" }, original: "value" },
      add_to_deep: { original: "value", thing: "thingy" },

      env_files: [".env.stage"],
      environment: {
        example: "thing",
      },

      new_variable: "thingy",
      new_deep_variable: { thing: "thingy" },
    });
  });

  test("it should throw on unhandled edge cases", () => {
    expect(() => {
      loadEnvironmentIntoConfig(
        {
          add_to_deep: { another: "thing" },
        },
        {
          app__add_to_deep: "thingy",
        }
      );
    }).toThrow("Tried to override config structure with env");
    expect(() => {
      loadEnvironmentIntoConfig(
        {
          add_to_deep: "thing",
        },
        {
          app__add_to_deep__another: "thingy",
        }
      );
    }).toThrow("Tried to change config structure with env");
    expect(() => {
      const c = { thing: { test_array: ["1", "2"] } };
      loadEnvironmentIntoConfig(c, {
        app__thing__test_array__another: "asd",
      });
    }).toThrow("Tried to change config array");
  });

  test("it should load an example yaml with dot-env overrides", () => {
    process.env.app__from_default_yaml_process_env_override = "correct";

    const config = loadConfig(__dirname, "test");

    expect(process.env.app__from_env).toEqual("correct");
    expect(process.env.app__yaml_override).toEqual("correct");

    expect(config).toEqual({
      yaml_override: "correct",
      from_config: "correct",
      from_env: "correct",
      from_default_yaml: "correct",
      from_default_yaml_override: "correct",
      from_default_yaml_env_override: "correct",
      from_default_yaml_process_env_override: "correct",
      environment: {
        app__yaml_override: "correct",
        app__from_env: "wrong_again",
        app__from_default_yaml_env_override: "wrong2",
        app__from_default_yaml_process_env_override: "wrong5",
      },
      env_files: ["config.env"],
    });
  });
});
