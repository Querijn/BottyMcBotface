declare module "to-markdown" {
    function markdownify(input: string, options?: {
        gfm?: boolean
    }): string;

    export = markdownify;
}