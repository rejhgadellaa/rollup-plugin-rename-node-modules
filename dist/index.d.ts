import { Plugin } from "rollup";
declare const plugin: (
  moduleName?: string | ((fileName: string) => string),
  sourceMaps?: boolean
) => Plugin;
export default plugin;
