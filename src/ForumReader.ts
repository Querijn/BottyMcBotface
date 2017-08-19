import { default as AnswerHubAPI, Node, NodeList, Question } from "./AnswerHub";
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
    private answerHub: AnswerHubAPI;
    private cachedNodes: Map<number, Question> = new Map();
    private erroredActivities: { activity: Node; attempts: number }[] = [];
    private keyFinder: KeyFinder;
    private settings: ForumReaderSettings;
    private data: ForumReaderData;
    private channel: Discord.TextChannel;

    constructor(bot: Discord.Client, settingsFile: string, dataFile: string, keyFinder: KeyFinder) {
        console.log("Requested ForumReader extension..");

        this.settings = fileBackedObject(settingsFile);
        console.log("Successfully loaded ForumReader settings file.");

        this.data = fileBackedObject(dataFile);
        console.log("Successfully loaded ForumReader data file.");

        this.keyFinder = keyFinder;
        this.answerHub = new AnswerHubAPI(this.settings.URL, this.settings.Username, this.settings.Password);
        this.cachedNodes = new Map();

        if (this.data.Last.question === 0) this.data.Last.question = Date.now();
        if (this.data.Last.answer === 0) this.data.Last.answer = Date.now();
        if (this.data.Last.comment === 0) this.data.Last.comment = Date.now();

        bot.on("ready", () => {
            const guild = bot.guilds.find("name", this.settings.Server);
            if (!guild) {
                console.error(`Incorrect setting for the server: ${this.settings.Server}`);
                return;
            }

            const channel = guild.channels.find("name", this.settings.Channel);
            if (!channel || !(channel instanceof Discord.TextChannel)) {
                console.error(`Incorrect setting for the channel: ${this.settings.Channel}`);
                return;
            }
            this.channel = channel as Discord.TextChannel;

            this.fetchForumData();
            setInterval(() => {
                this.fetchForumData();
            }, this.settings.CheckInterval);
        });
    }

    /**
	 * Gets the question with the specified ID, first checking the cache, then the AnswerHubAPI
	 * @param id The question ID
	 * @async
	 * @returns The question with the specified ID
	 * @throws {Error} Thrown if an AnswerHubAPI error occurs
	 */
    async getQuestion(id: number): Promise<Question> {
        if (this.cachedNodes.has(id)) {
            return this.cachedNodes.get(id)!;
        } else {
            const question = await this.answerHub.getQuestion(id);
            this.cachedNodes.set(id, question);
            return question;
        }
    }

    async readActivity(activity: Node) {
        const usernameIndex = activity.author.username.indexOf("(");
        const regionEndIndex = activity.author.username.indexOf(")");
        const region = usernameIndex === -1 ? "UNKNOWN" : activity.author.username.substr(usernameIndex + 1, regionEndIndex - usernameIndex - 1);
        const username = usernameIndex === -1 ? activity.author.username : activity.author.username.substr(0, usernameIndex - 1);
        const avatar = `http://avatar.leagueoflegends.com/${encodeURIComponent(region)}/${encodeURIComponent(username)}.png?t=${encodeURIComponent(Math.random().toString())}`;
        let embed = null;

        switch (activity.type) {
            case "question": {
                embed = new Discord.RichEmbed()
                    .setColor(0xc62f2f)
                    .setTitle(`${activity.author.username} asked "${activity.title}"`)
                    .setDescription(AnswerHubAPI.formatQuestionBody(activity.body))
                    .setURL(`${this.answerHub.baseURL}questions/${activity.id}/${activity.slug}.html`);

                this.keyFinder.findKey(username, activity.title, <string>embed.url, activity.creationDate);
                break;
            }

            case "answer": {
                const question = await this.getQuestion(activity.originalParentId);
                embed = new Discord.RichEmbed()
                    .setColor(0xd1f442)
                    .setTitle(`${activity.author.username} posted an answer on "${question.title}"`)
                    .addField("Question", AnswerHubAPI.formatQuestionBody(question.body), false)
                    .addField(`${activity.author.username}'s answer`, AnswerHubAPI.formatQuestionBody(activity.body), false)
                    .setURL(`${this.answerHub.baseURL}questions/${activity.originalParentId}/?childToView=${activity.id}#answer-${activity.id}`);

                break;
            }

            case "comment": {
                const question: Question = await this.getQuestion(activity.originalParentId);
                embed = new Discord.RichEmbed()
                    .setColor(0x4fb9f7)
                    .setTitle(`${activity.author.username} posted a comment on "${question.title}"`)
                    .setDescription(AnswerHubAPI.formatQuestionBody(activity.body))
                    .setURL(`${this.answerHub.baseURL}questions/${activity.originalParentId}/?childToView=${activity.id}#comment-${activity.id}`);

                break;
            }

            default:
                console.error(`Unknown activity type: ${activity.type}`);
        }
        if (!embed) return;

        this.keyFinder.findKey(username, activity.body, <string>embed.url, activity.creationDate);
        embed.setTimestamp(new Date(activity.creationDate)).setThumbnail(avatar);

        await this.channel.send("", {
            embed: embed
        });

        this.data.Last[activity.type] = activity.creationDate;
    }

    async readActivities(promise: Promise<NodeList<Node>>) {
        let activities;
        try {
            activities = await promise;
        } catch (error) {
            console.error(`Exception occurred fetching forum urls: ${error.message}`);
            return;
        }

        try {
            for (let i = activities.list.length - 1; i >= 0; i--) {
                const activity = activities.list[i];

                try {
                    if (activity.creationDate > this.data.Last[activity.type]) await this.readActivity(activity);
                } catch (error) {
                    console.error(`Error for activity ID ${activity.id}: ${error.message}`);
                    this.erroredActivities.push({
                        activity: activity,
                        attempts: 1
                    });
                }
            }
        } catch (error) {
            console.error(`Exception occurred reading forum: ${error.message}`);
        }
    }

    async retryErroredActivities() {
        for (let i = 0; i < this.erroredActivities.length; i++) {
            const activity = this.erroredActivities[i].activity;

            try {
                await this.readActivity(activity);
            } catch (error) {
                console.error(`Error for activity ID ${activity.id}: ${error.message}`);
                if (++this.erroredActivities[i].attempts >= 3) {
                    console.error(`Giving up on activity ID ${activity.id}`);
                    this.erroredActivities.splice(i, 1);
                }
            }
        }
    }

    fetchForumData() {
        this.readActivities(this.answerHub.getQuestions());
        this.readActivities(this.answerHub.getAnswers());
        this.readActivities(this.answerHub.getComments());
        this.retryErroredActivities();
    }
}
