import request = require("request");
import toMarkdown = require("to-markdown");

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
	private MakeRequest<T>(a_URL: string): Promise<T> {
		return new Promise((resolve, reject) => {
			const t_Options = {
				followAllRedirects: true,
				url: `${this.m_BaseURL}services/v2/${a_URL}`,
				headers: {
					"Accept": "application/json",
					"Content-Type": "application/json",
					"Authorization": this.m_Auth
				},
			};

			request.post(t_Options, (a_Error, a_Response) => {
				if (a_Error) {
					reject(a_Error);
				} else if (a_Response.statusCode !== 200) {
					reject("Received status code " + a_Response.statusCode);
				} else {
					try {
						const body = JSON.parse(a_Response.body);
						resolve(body);
					} catch (t_Error) {
						reject(t_Error);
					}
				}
			});
		});
	}

	public FormatBody(a_Body: string): string {
		const t_Markdown = toMarkdown(a_Body, { gfm: true });
		const t_Clamped = t_Markdown.substr(0, Math.min(1021, t_Markdown.length));
		// TODO handle relative links
		// TODO handle code blocks
		return t_Clamped + (t_Clamped.length === 1021 ? "..." : "");
	}

	GetQuestions(a_Page = 1, a_Sort = "active"): Promise<NodeList<Question>> {
		return this.MakeRequest(`question.json?page=${a_Page}&sort=${a_Sort}`);
	}

	GetAnswers(a_Page = 1, a_Sort = "active"): Promise<NodeList<Answer>> {
		return this.MakeRequest(`answer.json?page=${a_Page}&sort=${a_Sort}`);
	}

	GetComments(a_Page = 1, a_Sort = "active"): Promise<NodeList<Comment>> {
		return this.MakeRequest(`comment.json?page=${a_Page}&sort=${a_Sort}`);
	}

	GetQuestion(a_ID: number): Promise<Question> {
		return this.MakeRequest(`question/${a_ID}.json`);
	}

	GetArticle(a_ID: number): Promise<Article> {
		return this.MakeRequest(`article/${a_ID}.json`);
	}

	GetAnswer(a_ID: number): Promise<Answer> {
		return this.MakeRequest(`answer/${a_ID}.json`);
	}

	GetComment(a_ID: number): Promise<Comment> {
		return this.MakeRequest(`comment/${a_ID}.json`);
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
