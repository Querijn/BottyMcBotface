const request = require("request");
const toMarkdown = require("to-markdown");

class API
{
    constructor(a_URL, a_Username, a_Password)
    {
        // Add a trailing / if missing
        this.m_BaseURL = a_URL.substr(a_URL.length - 1) === "/" ? a_URL : a_URL + "/";

        this.m_Auth = new Buffer(a_Username + ":" + a_Password, "binary").toString("base64");
    }

    MakeRequest(a_URL, a_Callback)
    {
        const t_Options =
        {
            followAllRedirects: true,
            url: this.m_BaseURL + "services/v2/" + a_URL,
            headers: 
            {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Authorization": "Basic " + this.m_Auth
            },
        };

        return request.post(t_Options, a_Callback);
    }

    FormatBody(a_Body) {
        const t_Markdown = toMarkdown(a_Body, { gfm: true });
        const t_Clamped = t_Markdown.substr(0, Math.min(1021, t_Markdown.length));

        return t_Clamped + (t_Clamped.length === 1021 ? "..." : "");
    }

    get BaseURL()
    {
        return this.m_BaseURL;
    }

    GetQuestions(a_Callback, a_Page = 1, a_Sort = "active")
    {
        const t_URL = "question.json?page=" + a_Page + "&sort=" + a_Sort;
        return this.MakeRequest(t_URL, a_Callback);
    }

    GetAnswers(a_Callback, a_Page = 1, a_Sort = "active")
    {
        const t_URL = "answer.json?page=" + a_Page + "&sort=" + a_Sort;
        return this.MakeRequest(t_URL, a_Callback);
    }

    GetComments(a_Callback, a_Page = 1, a_Sort = "active")
    {
        const t_URL = "comment.json?page=" + a_Page + "&sort=" + a_Sort;
        return this.MakeRequest(t_URL, a_Callback);
    }

    GetQuestion(a_Callback, a_ID)
    {
        return this.MakeRequest("question/" + a_ID + ".json", a_Callback);
    }

    GetArticle(a_Callback, a_ID)
    {
        return this.MakeRequest("article/" + a_ID + ".json", a_Callback);
    }

    GetAnswer(a_Callback, a_ID)
    {
        return this.MakeRequest("answer/" + a_ID + ".json", a_Callback);
    }

    GetComment(a_Callback, a_ID)
    {
        return this.MakeRequest("comment/" + a_ID + ".json", a_Callback);
    }
}

exports.API = API;
