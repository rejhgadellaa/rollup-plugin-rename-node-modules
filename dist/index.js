"use strict";

var estreeWalker = require("estree-walker");
var MagicString = require("magic-string");
var path = require("path");

function _interopDefaultLegacy(e) {
  return e && typeof e === "object" && "default" in e ? e : { default: e };
}

var MagicString__default = /*#__PURE__*/ _interopDefaultLegacy(MagicString);

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
            const magicString = new MagicString__default["default"](
              chunkInfo.code
            );
            const ast = this.parse(chunkInfo.code, {
              ecmaVersion: "latest",
              sourceType: "module",
            });
            estreeWalker.walk(ast, {
              enter(node) {
                if (importNodeTypes.includes(node.type)) {
                  const req = getRequireSource(node) || getImportSource(node);
                  if (req && req.value.includes("node_modules")) {
                    const { start, end } = req;
                    // compute a new path relative to the bundle root
                    const bundlePath = replace(
                      path.posix.join(path.posix.dirname(fileName), req.value)
                    );
                    // and then format the path relative to the updated chunk path
                    const newPath = path.posix.relative(
                      path.posix.dirname(chunkInfo.fileName),
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

module.exports = plugin;
