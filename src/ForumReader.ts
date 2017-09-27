import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";
import { PersonalSettings } from "./PersonalSettings";

import { default as AnswerHubAPI, Node, NodeList, Question } from "./AnswerHub";
import KeyFinder from "./KeyFinder";
import Discord = require("discord.js");


export interface ForumReaderData {
    Last: {
        question: number;
        answer: number;
        comment: number;
        kbentry: number;
    };
}

export default class ForumReader {
    /** How many attempts should be made to process each activity before giving up on it */
    private static MAX_ATTEMPTS = 3;

    private answerHub: AnswerHubAPI;
    private cachedNodes: Map<number, Question> = new Map();
    /** Activities that could not be successfully parsed and will be retried */
    private erroredActivities: { activity: Node; /** How many attempts have been made to process this activity */ attempts: number }[] = [];
    private keyFinder: KeyFinder;
    private sharedSettings: SharedSettings;
    private personalSettings: PersonalSettings;
    private data: ForumReaderData;
    private channel: Discord.TextChannel;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings, personalSettings: PersonalSettings, dataFile: string, keyFinder: KeyFinder) {
        console.log("Requested ForumReader extension..");

        this.sharedSettings = sharedSettings;
        this.personalSettings = personalSettings;
        console.log("Successfully loaded ForumReader settings.");

        this.data = fileBackedObject(dataFile);
        console.log("Successfully loaded ForumReader data file.");

        this.keyFinder = keyFinder;
        this.answerHub = new AnswerHubAPI(this.sharedSettings.forum.url, this.personalSettings.forum.username, this.personalSettings.forum.password);
        this.cachedNodes = new Map();

        if (this.data.Last.question === 0) this.data.Last.question = Date.now();
        if (this.data.Last.answer === 0) this.data.Last.answer = Date.now();
        if (this.data.Last.comment === 0) this.data.Last.comment = Date.now();
        if (this.data.Last.kbentry === 0) this.data.Last.kbentry = Date.now();

        bot.on("ready", () => {
            let guild = bot.guilds.get(this.sharedSettings.server);
            if (!guild) {
                console.error(`ForumReader: Incorrect settings for guild ID ${this.sharedSettings.server}`);
                return;
            }

            const channel = guild.channels.find("name", this.sharedSettings.forum.channel);
            if (!channel || !(channel instanceof Discord.TextChannel)) {
                console.error(`ForumReader: Incorrect setting for the channel: ${this.sharedSettings.forum.channel}`);
                return;
            }
            this.channel = channel as Discord.TextChannel;

            this.fetchForumData();
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

    /**
     * Sends a message in Discord for the specified activity.
     * @param activity The activity to process
     */
    async readActivity(activity: Node): Promise<void> {
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
                    .setDescription(this.answerHub.formatQuestionBody(activity.body))
                    .setURL(`${this.answerHub.baseURL}questions/${activity.id}/${activity.slug}.html`);

                this.keyFinder.findKey(username, activity.title, <string>embed.url, activity.creationDate);
                break;
            }

            case "answer": {
                const question = await this.getQuestion(activity.originalParentId);
                embed = new Discord.RichEmbed()
                    .setColor(0xd1f442)
                    .setTitle(`${activity.author.username} posted an answer on "${question.title}"`)
                    .addField("Question", this.answerHub.formatQuestionBody(question.body), false)
                    .addField(`${activity.author.username}'s answer`, this.answerHub.formatQuestionBody(activity.body), false)
                    .setURL(`${this.answerHub.baseURL}questions/${activity.originalParentId}/?childToView=${activity.id}#answer-${activity.id}`);

                break;
            }

            case "comment": {
                const question: Question = await this.getQuestion(activity.originalParentId);
                embed = new Discord.RichEmbed()
                    .setColor(0x4fb9f7)
                    .setTitle(`${activity.author.username} posted a comment on "${question.title}"`)
                    .setDescription(this.answerHub.formatQuestionBody(activity.body))
                    .setURL(`${this.answerHub.baseURL}questions/${activity.originalParentId}/?childToView=${activity.id}#comment-${activity.id}`);

                break;
            }

            case "kbentry": {
                embed = new Discord.RichEmbed()
                    .setColor(0x4fb9f7)
                    .setTitle(`${activity.author.username} posted the article "${activity.title}"`)
                    .setDescription(this.answerHub.formatQuestionBody(activity.body))
                    .setURL(`${this.answerHub.baseURL}articles/${activity.id}/`);

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
    }

    /**
     * Waits for a promise to be fulfilled, then processes all the activities is was settled with. If any activities cannot be successfully processed,
     * they will be added to a list to be processed later.
     * @param promise 
     */
    async readActivities(promise: Promise<NodeList<Node>>): Promise<void> {
        let activities;
        try {
            activities = await promise;
        } catch (error) {
            console.error(`Exception occurred fetching forum urls: ${error}`);
            return;
        }

        try {
            for (let i = activities.list.length - 1; i >= 0; i--) {
                const activity = activities.list[i];

                try {
                    if (activity.creationDate > this.data.Last[activity.type]) await this.readActivity(activity);
                } catch (error) {
                    console.error(`Error for activity ID ${activity.id}: ${error}`);
                    this.erroredActivities.push({
                        activity: activity,
                        attempts: 1
                    });
                }
                if (this.data.Last[activity.type] < activity.creationDate) this.data.Last[activity.type] = activity.creationDate;
            }
        } catch (error) {
            console.error(`Exception occurred reading forum: ${error}`);
        }
        return;
    }

    async retryErroredActivities(): Promise<void> {
        for (let i = 0; i < this.erroredActivities.length; i++) {
            const activity = this.erroredActivities[i].activity;

            try {
                await this.readActivity(activity);
            } catch (error) {
                console.error(`Error for activity ID ${activity.id}: ${error.message}`);
                if (++this.erroredActivities[i].attempts >= ForumReader.MAX_ATTEMPTS) {
                    console.error(`Giving up on activity ID ${activity.id}`);
                    this.erroredActivities.splice(i, 1);
                }
            }
        }
        return;
    }

    /**
     * Processes all new questions, answers, comments, and articles, then schedules the update.
     */
    async fetchForumData(): Promise<void> {
        await this.readActivities(this.answerHub.getQuestions());
        await this.readActivities(this.answerHub.getAnswers());
        await this.readActivities(this.answerHub.getComments());
        await this.readActivities(this.answerHub.getArticles());
        await this.retryErroredActivities();
        setTimeout(() => this.fetchForumData(), this.sharedSettings.forum.checkInterval);
    }
}
