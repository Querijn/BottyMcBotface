declare module "feed-read" {
    interface Article {
        title: string;
        author: string;
        link: string;
        content: string;
        published: Date;
    }

    function feedRead(url: string, cb: (error: Error | null, articles: Article[]) => any): void;
    export = feedRead;
}