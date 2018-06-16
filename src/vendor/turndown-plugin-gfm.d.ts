declare module "turndown-plugin-gfm" {
    import TurndownService = require("turndown");

    function gfm(service: TurndownService): void;

    export { gfm as gfm };
}
