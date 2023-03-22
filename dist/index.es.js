import { walk } from "estree-walker";
import MagicString from "magic-string";
import { posix } from "path";

var NodeType;
(function (NodeType) {
  NodeType["Literal"] = "Literal";
  NodeType["CallExpression"] = "CallExpression";
  NodeType["Identifier"] = "Identifier";
  NodeType["ImportDeclaration"] = "ImportDeclaration";
})(NodeType || (NodeType = {}));
function isEmpty(array) {
  return !array || array.length === 0;
}
function getRequireSource(node) {
  if (node.type !== NodeType.CallExpression) {
    return false;
  }
  if (node.callee.type !== NodeType.Identifier || isEmpty(node.arguments)) {
    return false;
  }
  const args = node.arguments;
  if (node.callee.name !== "require" || args[0].type !== NodeType.Literal) {
    return false;
  }
  return args[0];
}
function getImportSource(node) {
  if (
    node.type !== NodeType.ImportDeclaration ||
    node.source.type !== NodeType.Literal
  ) {
    return false;
  }
  return node.source;
}
const importNodeTypes = [NodeType.ImportDeclaration, NodeType.CallExpression];
const plugin = (moduleName = "external", sourceMaps = true) => {
  const replace =
    typeof moduleName === "string"
      ? (fileName) => fileName.replace(/node_modules/g, moduleName)
      : moduleName;
  return {
    name: "rename-external-node-modules",
    generateBundle(_, bundle) {
      const changedFiles = [];
      Object.entries(bundle).forEach(([fileName, chunkInfo]) => {
        if (fileName.includes("node_modules")) {
          const newFileName = replace(fileName);
          chunkInfo.fileName = newFileName;
          changedFiles.push(fileName);
        }
        if ("code" in chunkInfo) {
          if (chunkInfo.imports.some((i) => i.includes("node_modules"))) {
            const magicString = new MagicString(chunkInfo.code);
            const ast = this.parse(chunkInfo.code, {
              ecmaVersion: "latest",
              sourceType: "module",
            });
            walk(ast, {
              enter(node) {
                if (importNodeTypes.includes(node.type)) {
                  const req = getRequireSource(node) || getImportSource(node);
                  if (req && req.value.includes("node_modules")) {
                    const { start, end } = req;
                    // compute a new path relative to the bundle root
                    const bundlePath = replace(
                      posix.join(posix.dirname(fileName), req.value)
                    );
                    // and then format the path relative to the updated chunk path
                    const newPath = posix.relative(
                      posix.dirname(chunkInfo.fileName),
                      bundlePath
                    );
                    // add ./ to files relative to project root
                    const normalizedPath =
                      newPath.startsWith("./") || newPath.startsWith("../")
                        ? newPath
                        : `./${newPath}`;
                    magicString.overwrite(start, end, `'${normalizedPath}'`);
                  }
                }
              },
            });
            if (sourceMaps) {
              chunkInfo.map = magicString.generateMap();
            }
            chunkInfo.code = magicString.toString();
          }
        }
      });
      for (const fileName of changedFiles) {
        const file = bundle[fileName];
        const newFileName = file.fileName;
        delete bundle[fileName];
        bundle[newFileName] = file;
      }
    },
  };
};

export default plugin;
