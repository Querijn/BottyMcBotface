import { API as AnswerHubAPI, Node, NodeList, Question } from "./AnswerHub";
import KeyFinder from "./KeyFinder";
import Discord = require("discord.js");
import { fileBackedObject } from "./util";

export interface ForumReaderSettings {
    CheckInterval: number;
    Server: string;
    Channel: string;
    URL: string;
    Username: string;
    Password: string;
}

export interface ForumReaderData {
    Last: {
        question: number;
        answer: number;
        comment: number;
    };
}

export default class ForumReader {
    private m_Answerhub: AnswerHubAPI;
    private m_CachedNodes: Map<number, Question> = new Map();
    private m_ErroredActivities: { activity: Node; attempts: number }[] = [];
    private m_KeyFinder: KeyFinder;
    private m_Settings: ForumReaderSettings;
    private m_Data: ForumReaderData;
    private m_Channel: Discord.TextChannel;

    constructor(a_Bot: Discord.Client, a_SettingsFile: string, a_DataFile: string, a_KeyFinder: KeyFinder) {
        console.log("Requested ForumReader extension..");

        this.m_Settings = fileBackedObject(a_SettingsFile);
        console.log("Successfully loaded ForumReader settings file.");

        this.m_Data = fileBackedObject(a_DataFile);
        console.log("Successfully loaded ForumReader data file.");

        this.m_KeyFinder = a_KeyFinder;
        this.m_Answerhub = new AnswerHubAPI(this.m_Settings.URL, this.m_Settings.Username, this.m_Settings.Password);
        this.m_CachedNodes = new Map();

        if (this.m_Data.Last.question === 0) this.m_Data.Last.question = Date.now();
        if (this.m_Data.Last.answer === 0) this.m_Data.Last.answer = Date.now();
        if (this.m_Data.Last.comment === 0) this.m_Data.Last.comment = Date.now();

        a_Bot.on("ready", () => {
            const t_Guild = a_Bot.guilds.find("name", this.m_Settings.Server);
            if (!t_Guild) {
                console.error("Incorrect setting for the server: " + this.m_Settings.Server);
                return;
            }

            const t_Channel = t_Guild.channels.find("name", this.m_Settings.Channel);
            if (!t_Channel || !(t_Channel instanceof Discord.TextChannel)) {
                console.error("Incorrect setting for the channel: " + this.m_Settings.Channel);
                return;
            }
            this.m_Channel = t_Channel as Discord.TextChannel;

            this.FetchForumData();
            setInterval(() => {
                this.FetchForumData();
            }, this.m_Settings.CheckInterval);
        });
    }

    /**
	 * Gets the question with the specified ID, first checking the cache, then the API
	 * @param a_Id The question ID
	 * @async
	 * @returns The question with the specified ID
	 * @throws {Error} Thrown if an API error occurs
	 */
    async GetQuestion(a_Id: number): Promise<Question> {
        if (this.m_CachedNodes.has(a_Id)) {
            return this.m_CachedNodes.get(a_Id)!;
        } else {
            try {
                const t_Question = await this.m_Answerhub.GetQuestion(a_Id);
                this.m_CachedNodes.set(a_Id, t_Question);
                return t_Question;
            } catch (t_Error) {
                throw t_Error;
            }
        }
    }

    async ReadActivity(a_Activity: Node) {
        const t_UsernameIndex = a_Activity.author.username.indexOf("(");
        const t_RegionEndIndex = a_Activity.author.username.indexOf(")");
        const t_Region = t_UsernameIndex === -1 ? "UNKNOWN" : a_Activity.author.username.substr(t_UsernameIndex + 1, t_RegionEndIndex - t_UsernameIndex - 1);
        const t_Username = t_UsernameIndex === -1 ? a_Activity.author.username : a_Activity.author.username.substr(0, t_UsernameIndex - 1);
        const t_Avatar = `http://avatar.leagueoflegends.com/${encodeURIComponent(t_Region)}/${encodeURIComponent(t_Username)}.png?t=${encodeURIComponent(Math.random().toString())}`;
        let t_Embed = null;

        switch (a_Activity.type) {
            case "question": {
                t_Embed = new Discord.RichEmbed()
                    .setColor(0xc62f2f)
                    .setTitle(`${a_Activity.author.username} asked "${a_Activity.title}"`)
                    .setDescription(this.m_Answerhub.FormatBody(a_Activity.body))
                    .setURL(`${this.m_Answerhub.m_BaseURL}questions/${a_Activity.id}/${a_Activity.slug}.html`);

                this.m_KeyFinder.findKey(t_Username, a_Activity.title, <string>t_Embed.url, a_Activity.creationDate);
                break;
            }

            case "answer": {
                const t_Question = await this.GetQuestion(a_Activity.originalParentId);
                t_Embed = new Discord.RichEmbed()
                    .setColor(0xd1f442)
                    .setTitle(`${a_Activity.author.username} posted an answer on "${t_Question.title}"`)
                    .addField("Question", this.m_Answerhub.FormatBody(t_Question.body), false)
                    .addField(`${a_Activity.author.username}'s answer`, this.m_Answerhub.FormatBody(a_Activity.body), false)
                    .setURL(`${this.m_Answerhub.m_BaseURL}questions/${a_Activity.originalParentId}/?childToView=${a_Activity.id}#answer-${a_Activity.id}`);

                break;
            }

            case "comment": {
                const t_Question: Question = await this.GetQuestion(a_Activity.originalParentId);
                t_Embed = new Discord.RichEmbed()
                    .setColor(0x4fb9f7)
                    .setTitle(`${a_Activity.author.username} posted a comment on "${t_Question.title}"`)
                    .setDescription(this.m_Answerhub.FormatBody(a_Activity.body))
                    .setURL(`${this.m_Answerhub.m_BaseURL}questions/${a_Activity.originalParentId}/?childToView=${a_Activity.id}#comment-${a_Activity.id}`);

                break;
            }

            default:
                console.error("Unknown activity type: " + a_Activity.type);
        }

        if (!t_Embed) return;

        t_Embed.setTimestamp(new Date(a_Activity.creationDate)).setThumbnail(t_Avatar);

        this.m_KeyFinder.findKey(t_Username, a_Activity.body, <string>t_Embed.url, a_Activity.creationDate);
        t_Embed.setTimestamp(new Date(a_Activity.creationDate)).setThumbnail(t_Avatar);

        await this.m_Channel.send("", {
            embed: t_Embed
        });

        this.m_Data.Last[a_Activity.type] = a_Activity.creationDate;
    }

    async ReadActivities(a_Promise: Promise<NodeList<Node>>) {
        let t_Activities;
        try {
            t_Activities = await a_Promise;
        } catch (t_Error) {
            console.error("Exception occurred fetching forum urls: " + t_Error.message);
            return;
        }

        try {
            for (let i = t_Activities.list.length - 1; i >= 0; i--) {
                const t_Activity = t_Activities.list[i];

                try {
                    if (t_Activity.creationDate > this.m_Data.Last[t_Activity.type]) await this.ReadActivity(t_Activity);
                } catch (t_Error) {
                    console.error(`Error for activity ID ${t_Activity.id}: ${t_Error.message}`);
                    this.m_ErroredActivities.push({
                        activity: t_Activity,
                        attempts: 1
                    });
                }
            }
        } catch (t_Error) {
            console.error("Exception occurred reading forum: " + t_Error.message);
        }
    }

    async RetryErroredActivities() {
        for (let i = 0; i < this.m_ErroredActivities.length; i++) {
            const t_Activity = this.m_ErroredActivities[i].activity;
            try {
                await this.ReadActivity(t_Activity);
            } catch (t_Error) {
                console.error(`Error for activity ID ${t_Activity.id}: ${t_Error.message}`);
                if (++this.m_ErroredActivities[i].attempts >= 3) {
                    console.error(`Giving up on activity ID ${t_Activity.id}`);
                    this.m_ErroredActivities.splice(i, 1);
                }
            }
        }
    }

    FetchForumData() {
        this.ReadActivities(this.m_Answerhub.GetQuestions());
        this.ReadActivities(this.m_Answerhub.GetAnswers());
        this.ReadActivities(this.m_Answerhub.GetComments());
        this.RetryErroredActivities();
    }
}
