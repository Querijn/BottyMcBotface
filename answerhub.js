const request = require("request");

class API
{
    constructor(a_URL, a_Username, a_Password)
    {
        // Add a trailing / if missing
        a_URL = a_URL.substr(a_URL.length - 1) === "/" ? a_URL : a_URL + "/";
        this.m_BaseURL = a_URL;

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

    FormatBody(a_Body)
    {
        let t_Body = a_Body.substr(0, Math.min(1021, a_Body.length));
        if(t_Body.length == 1021) t_Body += "...";
        
        t_Body = t_Body.replaceAll("<p></p>", " ");
        t_Body = t_Body.replaceAll("<p>", " ");

        t_Body = t_Body.replaceAll("</p>", "\n\n ");
        t_Body = t_Body.replaceAll("<br>", "\n ");

        t_Body = t_Body.replaceAll("<em>", "*");
        t_Body = t_Body.replaceAll("</em>", "*");
        t_Body = t_Body.replaceAll("<strong>", "**");
        t_Body = t_Body.replaceAll("</strong>", "**");

        t_Body = t_Body.replaceAll("<ol>", "");
        t_Body = t_Body.replaceAll("</ol>", "");
        t_Body = t_Body.replaceAll("<li>", " - ");
        t_Body = t_Body.replaceAll("</li>", "\n");

        t_Body = t_Body.replaceAll("<code>", "`");
        t_Body = t_Body.replaceAll("</code>", "`");

        t_Body = t_Body.replaceAll("<pre>", "```");
        t_Body = t_Body.replaceAll("</pre>", "```");
        
        //t_Body = t_Body.replace("/<a(.*?)href=\"(.*?)\"(.*?)>(.*?)</a>/i", (match, p1, p2, p3, p4, offset, string) => { return p2; });
        //t_Body = t_Body.replace("/<img(.*?)src=\"(.*?)\"(.*?)>/i", (match, p1, p2, p3, offset, string) => { return p2; });

        return t_Body;
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
