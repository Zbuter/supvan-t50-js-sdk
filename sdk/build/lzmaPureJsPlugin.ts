import ts from "typescript";
import type { Plugin } from "vite";

const PACKAGE_SEGMENT = "/node_modules/lzma-purejs/";

function withJavaScriptExtension(specifier: string): string {
  return specifier.endsWith(".js") ? specifier : `${specifier}.js`;
}

/** Converts lzma-purejs' uniform AMD wrappers to ESM without changing its encoder. */
export function lzmaPureJsPlugin(): Plugin {
  return {
    name: "shuofang-lzma-purejs-esm",
    enforce: "pre",
    transform(source, rawId) {
      const id = rawId.replace(/\\/g, "/").split("?", 1)[0] ?? rawId;
      if (!id.includes(PACKAGE_SEGMENT) || !id.endsWith(".js")) return null;

      const file = ts.createSourceFile(id, source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.JS);
      let definition: ts.CallExpression | undefined;
      for (const statement of file.statements) {
        if (!ts.isExpressionStatement(statement) || !ts.isCallExpression(statement.expression)) continue;
        const call = statement.expression;
        if (ts.isIdentifier(call.expression) && call.expression.text === "define") {
          definition = call;
          break;
        }
      }
      if (!definition) return null;

      const [dependencyNode, factoryNode] = definition.arguments;
      if (
        !dependencyNode ||
        !ts.isArrayLiteralExpression(dependencyNode) ||
        !factoryNode ||
        !ts.isFunctionExpression(factoryNode)
      ) {
        throw new Error(`无法转换 lzma-purejs AMD 模块：${id}`);
      }

      const dependencies = dependencyNode.elements.map((element) => {
        if (!ts.isStringLiteral(element)) throw new Error(`lzma-purejs 含非字符串依赖：${id}`);
        if (!element.text.startsWith(".")) throw new Error(`lzma-purejs 含非相对依赖：${element.text}`);
        return withJavaScriptExtension(element.text);
      });
      if (dependencies.length !== factoryNode.parameters.length) {
        throw new Error(`lzma-purejs 依赖与 factory 参数数量不一致：${id}`);
      }

      const imports = dependencies.map(
        (specifier, index) => `import __lzmaDependency${index} from ${JSON.stringify(specifier)};`,
      );
      const factory = source.slice(factoryNode.getStart(file), factoryNode.end);
      const argumentsList = dependencies.map((_, index) => `__lzmaDependency${index}`).join(", ");
      return {
        code: `${imports.join("\n")}\nconst __lzmaModule = (${factory})(${argumentsList});\nexport default __lzmaModule;\n`,
        map: null,
      };
    },
  };
}
