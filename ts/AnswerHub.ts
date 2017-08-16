import request = require("request");
const toMarkdown = require("to-markdown");

export class API {
	/** The base AnswerHub URL (with a trailing slash) */
	public readonly m_BaseURL: string;
	/** The value of the "Authorization" header to be included with all API requests */
	private readonly m_Auth: string;

	public constructor(a_URL: string, a_Username: string, a_Password: string) {
		// Add a trailing / if missing
		this.m_BaseURL = a_URL.substr(a_URL.length - 1) === "/" ? a_URL : a_URL + "/";

		this.m_Auth = "Basic " + new Buffer(a_Username + ":" + a_Password, "binary").toString("base64");
	}
    /**
     * Makes a request to the AnswerHub API
     * @param a_URL The URL to make a request to, relative to the base API URL
     * @async
     * @throws {any} Thrown if an error is received from the API
     * @returns The parsed body of the response from the API
     */
	private MakeRequest(a_URL: string): Promise<any> {
		return new Promise((resolve: Function, reject: Function) => {
			const t_Options = {
				followAllRedirects: true,
				url: `${this.m_BaseURL}services/v2/${a_URL}`,
				headers:
				{
					"Accept": "application/json",
					"Content-Type": "application/json",
					"Authorization": this.m_Auth
				},
			};

			request.post(t_Options, (a_Error, a_Response: request.RequestResponse) => {
				if (a_Error) {
					reject(a_Error);
				} else if (a_Response.statusCode !== 200) {
					reject("Received status code " + a_Response.statusCode);
				} else {
					try {
						const body: any = JSON.parse(a_Response.body);
						resolve(body);
					} catch (t_Error) {
						reject(t_Error);
					}
				}
			});
		});
	}

	public FormatBody(a_Body: string): string {
		const t_Markdown = toMarkdown(a_Body, {gfm: true});
		const t_Clamped = t_Markdown.substr(0, Math.min(1021, t_Markdown.length));
		// TODO handle relative links
		// TODO handle code blocks
		return t_Clamped + (t_Clamped.length === 1021 ? "..." : "");
	}

	async GetQuestions(a_Page: number = 1, a_Sort = "active"): Promise<NodeList<Question>> {
		return await this.MakeRequest(`question.json?page=${a_Page}&sort=${a_Sort}`) as NodeList<Question>;
	}

	async GetAnswers(a_Page: number = 1, a_Sort = "active"): Promise<NodeList<Answer>> {
		return await this.MakeRequest(`answer.json?page=${a_Page}&sort=${a_Sort}`) as NodeList<Answer>;
	}

	async GetComments(a_Page: number = 1, a_Sort = "active"): Promise<NodeList<Comment>> {
		return await this.MakeRequest(`comment.json?page=${a_Page}&sort=${a_Sort}`) as NodeList<Comment>;
	}

	async GetQuestion(a_ID: number): Promise<Question> {
		return await this.MakeRequest(`question/${a_ID}.json`) as Question;
	}

	async GetArticle(a_ID: number): Promise<Article> {
		return await this.MakeRequest(`article/${a_ID}.json`) as Article;
	}

	async GetAnswer(a_ID: number): Promise<Answer> {
		return await this.MakeRequest(`answer/${a_ID}.json`) as Answer;
	}

	async GetComment(a_ID: number): Promise<Comment> {
		return await this.MakeRequest(`comment/${a_ID}.json`) as Comment;
	}
}

// TODO document more fields that this contains (that aren't being used)?
/**
 * A comment, question, or answer
 * @see http://api.dzonesoftware.com/v2/reference#section-node-data-models
 */
export interface Node {
	id: number;
	type: "question" | "comment" | "answer";
	/** The time when this node was created (in epoch milliseconds) */
	creationDate: number;
	title: string;
	body: string;
	bodyAsHTML: string;
	author: {
		id: number,
		username: string
	};
	activeRevisionId: number
	parentId: number;
	originalParentId: number;
	slug: string;
}

export interface Question extends Node {

}

export interface Answer extends Node {

}

export interface Comment extends Node {

}

export interface Article extends Node {

}

export interface NodeList<T extends Node> {
	list: T[];
}
