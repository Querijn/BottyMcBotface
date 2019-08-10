import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";

import Discord = require("discord.js");
import fetch from "node-fetch";

interface QuestionData {
    uuid: number;
    requester: string | null;
    authorMention: string;
    authorId: string;
    authorName: string;
    question: string;
}

interface OfficeHoursData {
    questions: QuestionData[];
    isOpen: boolean;
    lastCloseMessage: string;
    nextId: number;
}

interface OnThisDayAPI {
    date: string;
    url: string;
    data: OnThisDayAPIEvents;
}

interface OnThisDayAPIEvents {
    Events: OnThisDayAPIEvent[];
}

interface OnThisDayAPIEvent {
    year: string;
    text: string;
    html: string;
    links: OnThisDayAPIEventLink[];
}

interface OnThisDayAPIEventLink {
    title: string;
    link: string;
}

export default class OfficeHours {
    private data: OfficeHoursData;
    private sharedSettings: SharedSettings;
    private bot: Discord.Client;
    private guild: Discord.Guild;
    private channel: Discord.TextChannel;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings, officeHoursData: string) {
        console.log("Requested OfficeHours extension..");

        this.bot = bot;
        this.sharedSettings = sharedSettings;

        this.data = fileBackedObject(officeHoursData);
        console.log("Successfully question file.");

        this.bot.on("ready", this.setupOpenState.bind(this));
    }

    public onAsk(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        const question = args.join(" ");

        if (args[0] === "remove") {
            this.onQuestionRemove(message, isAdmin, args[0], args.slice(1));
            return;
        }

        if (isAdmin) {
            if (args[0] === "list") {
                this.onQuestionList(message, isAdmin, args[0], args.slice(1));
                return;
            }
        }

        this.storeQuestion(question, message, message.author, message.author.username);
    }

    public onAskFor(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        const asker = message.mentions.users.first();
        if (!asker) return;

        const question = args.slice(1).join(" ");
        this.storeQuestion(question, message, asker, message.author.username);
    }

    public onQuestionList(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        if (!this.data.questions || this.data.questions.length === 0) {
            this.data.questions = [];
            message.channel.send("No questions found.");
            return;
        }

        for (const data of this.data.questions) {
            message.channel.send(`${data.uuid}: ${data.authorName}: ${data.question}`);
        }
    }

    public onQuestionRemove(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {

        const id = +args[0];

        if (!isAdmin) {

            // Get user questions
            const questions = this.data.questions.filter(q => q.authorId == message.author.id);
            if (questions.length == 0)
                return;

            // Get the question user requested to delete
            const question = questions.find(q => q.uuid == id);
            if (!question) {
                let reply = "I'm sorry, but you must have entered the wrong ID. You own the following questions: \n";

                for (const ownedQuestion of questions) {
                    reply += `ID ${ownedQuestion.uuid}: ${ownedQuestion.question}\n`;
                }

                message.channel.send(reply);
                return;
            }
        }

        if (args.length === 1) {
            this.data.questions = this.data.questions.filter(q => q.uuid !== id);
            message.channel.send(this.sharedSettings.officehours.removedMessage);
            return;
        }

        message.channel.send("Invalid use of command, use !question remove {id}");
    }

    public onOpen(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        if (!(message.channel instanceof Discord.TextChannel) || message.channel.name !== "office-hours") {
            return;
        }
        message.delete();
        this.open(this.channel);
    }

    public onClose(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {
        if (!(message.channel instanceof Discord.TextChannel) || message.channel.name !== "office-hours") {
            return;
        }

        message.delete();
        this.close(this.channel);
    }

    private async setupOpenState() {

        this.guild = this.bot.guilds.get(this.sharedSettings.server)!;
        if (!this.guild) {
            console.error(`Office-Hours: Unable to find server with ID: ${this.sharedSettings.server}`);
            return;
        }

        this.channel = this.guild.channels.find("name", "office-hours") as Discord.TextChannel;
        if (!this.channel || !(this.channel instanceof Discord.TextChannel)) {
            if (this.sharedSettings.botty.isProduction) {
                console.error(`Office-Hours: Unable to find channel: #office-hours`);
                return;
            }
            else {
                this.channel = await this.guild.createChannel("office-hours", "text") as Discord.TextChannel;
            }
        }

        const everyone = this.guild.roles.find("name", "@everyone");
        const randomUser = this.guild.members.find(x => x.roles.has(everyone.id)); // && x.roles.size === 1);
        this.data.isOpen = this.channel.permissionsFor(randomUser).has("SEND_MESSAGES");
        console.log(`OfficeHours extension loaded (${this.data.isOpen ? "open" : "closed"}).`);
    }

    private storeQuestion(question: string, message: Discord.Message, author: Discord.User, requester: string | null = null) {

        if (question.length === 0) {
            message.reply("You forgot to ask a question...");
            return;
        }

        const questionData = {
            authorMention: author.toString(),
            authorName: author.username,
            authorId: author.id,
            question,
            requester,
            uuid: ++this.data.nextId,
        };

        if (this.data.isOpen) {
            this.channel.send(`${questionData.authorMention} asked ${questionData.requester ? `(via ${questionData.requester})` : ""}:\n ${questionData.question}`);
            message.reply("Your message has been posted in #office-hours, because its open at the moment!");
            return;
        }

        this.data.questions.push(questionData);
        message.channel.send(this.sharedSettings.officehours.addedMessage.replace(/{removeCommand}/, `\`!question remove ${questionData.uuid}\``));

        const moderatorChannel = this.guild.channels.find("name", "moderators");
        if (moderatorChannel instanceof Discord.TextChannel) {
            moderatorChannel.send(`${author.username} just asked a question: \`${question}\`, you can remove it with \`!question remove ${questionData.uuid}\``);
        }
    }

    private onChannelUpdate(oldChannel: Discord.TextChannel, newChannel: Discord.TextChannel) {

        if (newChannel.name !== "office-hours") {
            return;
        }

        const everyone = newChannel.guild.roles.find("name", "@everyone");
        const randomUser = newChannel.guild.members.find(x => x.roles.has(everyone.id) && x.roles.size === 1);
        const canSendMessages = newChannel.permissionsFor(randomUser).has("SEND_MESSAGES");
        if (canSendMessages && !this.data.isOpen) {
            this.open(newChannel);
        } else if (canSendMessages && this.data.isOpen) {
            this.close(newChannel);
        }
    }

    private async sendOnThisDayMessage(channel: Discord.TextChannel) {
        const onThisDayFetch = await fetch("https://history.muffinlabs.com/date");
        const onThisDayJson: OnThisDayAPI = await onThisDayFetch.json();
        const onThisDayEvent = onThisDayJson.data.Events[Math.floor(Math.random() * onThisDayJson.data.Events.length)];
        channel.send(`On this day in ${onThisDayEvent.year}, ${onThisDayEvent.text}`);
    }

    private async open(channel: Discord.TextChannel) {
        if (this.data.isOpen) return;
        this.data.isOpen = true;

        const everyone = channel.guild.roles.find("name", "@everyone");
        await channel.overwritePermissions(everyone, { SEND_MESSAGES: true });

        // Start with open message
        channel.send(this.sharedSettings.officehours.openMessage);

        // Add all questions with mention
        for (const data of this.data.questions) {
            channel.send(`${data.authorMention} asked ${data.requester ? `(via ${data.requester})` : ""}:\n ${data.question}`);
        }

        this.data.questions = [];
        this.data.nextId = 0;

        if (!this.data.lastCloseMessage) return;

        // Request last close message from Discord
        const closeMessage = await channel.fetchMessage(this.data.lastCloseMessage);

        // Find all users that raised their hand
        const reaction = closeMessage.reactions.get("✋");
        if (reaction) {
            const reactionUsers = await reaction.fetchUsers();
            const usersToMention = reactionUsers.array().filter(user => !user.bot);
            if (usersToMention.length > 0) {
                channel.send(usersToMention.join(", ") + "\n");
            }
        }

        this.sendOnThisDayMessage(channel);
    }

    private async close(channel: Discord.TextChannel) {
        if (!this.data.isOpen) return;
        this.data.isOpen = false;

        const everyone = channel.guild.roles.find("name", "@everyone");
        await channel.overwritePermissions(everyone, { SEND_MESSAGES: false });

        let message = await channel.send(this.sharedSettings.officehours.closeMessage.replace(/{botty}/g, this.bot.user.username));
        if (Array.isArray(message)) {
            message = message[0];
        }

        this.data.lastCloseMessage = message.id;
        message.react("✋");
    }

}

const findOne = (arr1: Discord.Collection<string, Discord.Role>, arr2: any[]) => {
    return arr2.some(x => arr1.has(x));
};
