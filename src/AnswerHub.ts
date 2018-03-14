import fetch from "node-fetch";
import toMarkdown = require("to-markdown");

export default class AnswerHubAPI {
    /** The base AnswerHub URL (with a trailing slash) */
    public readonly baseURL: string;
    /** The value of the "Authorization" header to be included with all AnswerHubAPI requests */
    private readonly auth: string;

    public constructor(url: string, username: string, password: string) {
        // Add a trailing / if missing
        this.baseURL = url.substr(url.length - 1) === "/" ? url : url + "/";

        this.auth = `Basic ${new Buffer(username + ":" + password, "binary").toString("base64")}`;
    }

    public getQuestions(page = 1, sort = "active"): Promise<NodeList<Question>> {
        return this.makeRequest(`question.json?page=${page}&sort=${sort}`);
    }

    public getAnswers(page = 1, sort = "active"): Promise<NodeList<Answer>> {
        return this.makeRequest(`answer.json?page=${page}&sort=${sort}`);
    }

    public getComments(page = 1, sort = "active"): Promise<NodeList<Comment>> {
        return this.makeRequest(`comment.json?page=${page}&sort=${sort}`);
    }

    public getArticles(page = 1, sort = "active"): Promise<NodeList<Article>> {
        return this.makeRequest(`article.json?page=${page}&sort=${sort}`);
    }

    public getQuestion(id: number): Promise<Question> {
        return this.makeRequest(`question/${id}.json`);
    }

    public getArticle(id: number): Promise<Article> {
        return this.makeRequest(`article/${id}.json`);
    }

    public getAnswer(id: number): Promise<Answer> {
        return this.makeRequest(`answer/${id}.json`);
    }

    public getComment(id: number): Promise<Comment> {
        return this.makeRequest(`comment/${id}.json`);
    }

    public getNode(id: number): Promise<Node> {
        // '/services/v2/article/[articleId].json' works for questions, answers, comments, and articles
        return this.makeRequest(`article/${id}.json`);
    }

    public formatQuestionBody(body: string): string {
        let markdown = toMarkdown(body, { gfm: true });
        // Format code blocks
        markdown = markdown.replace(/<pre>/g, "```").replace(/<\/pre>/g, "```");
        // Replace relative URIs in links with absolute URIs
        markdown = markdown.replace(/\[.*\]\((.*)\)/g, (fullMatch: string, uri: string) => {
            if (uri.startsWith("/")) {
                return fullMatch.replace(uri, this.baseURL + uri.slice(1));
            }
            return fullMatch;
        });

        const clamped = markdown.substr(0, Math.min(1021, markdown.length));
        return clamped + (clamped.length === 1021 ? "..." : "");
    }

    /**
     * Makes a request to the AnswerHub AnswerHubAPI
     * @param url The url to make a request to, relative to the base AnswerHubAPI url
     * @async
     * @throws {any} Thrown if an error is received from the AnswerHubAPI
     * @returns The parsed body of the response from the AnswerHubAPI
     */
    private async makeRequest<T>(url: string): Promise<T> {
        const resp = await fetch(`${this.baseURL}services/v2/${url}`, {
            headers: {
                "Accept": "application/json",
                "Authorization": this.auth,
                "Content-Type": "application/json",
            },
            method: "POST",
        });

        if (resp.status !== 200) {
            throw new Error(`Received status code ${resp.status}`);
        }

        return resp.json();
    }
}

// TODO document more fields that this contains (that aren't being used)?
/**
 * A comment, question, or answer
 * @see http://api.dzonesoftware.com/v2/reference#section-node-data-models
 */
export interface Node {
    id: number;
    type: "question" | "comment" | "answer" | "kbentry";
    /** The time when this node was created (in epoch milliseconds) */
    creationDate: number;
    title: string;
    body: string;
    bodyAsHTML: string;
    author: {
        id: number;
        username: string;
    };
    activeRevisionId: number;
    parentId: number;
    originalParentId: number;
    slug: string;
}

export interface Question extends Node { }

export interface Answer extends Node { }

export interface Comment extends Node { }

export interface Article extends Node { }

export interface NodeList<T extends Node> {
    list: T[];
}
