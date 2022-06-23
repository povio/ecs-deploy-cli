import { diffJson } from "diff";
import { chk } from "node-stage";

export function printDiff(one: object, two: object) {
  for (const { value, added, removed } of diffJson(one, two)) {
    if (added) {
      console.log(chk.yellow(value.replace(/\n$/, "")));
    } else if (removed) {
      console.log(chk.green(value.replace(/\n$/, "")));
    } else {
      const text = value.replace(/\n$/, "").split("\n");
      if (text.length < 6) {
        console.log(value.replace(/\n$/, ""));
      } else {
        console.log(
          [
            text[0],
            text[1],
            "...",
            text[text.length - 2],
            text[text.length - 1],
          ].join("\n")
        );
      }
    }
  }
}

export default {
  printDiff,
};
