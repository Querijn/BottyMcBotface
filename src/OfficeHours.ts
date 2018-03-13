import { SharedSettings } from "./SharedSettings";
import { fileBackedObject } from "./FileBackedObject";
import fetch from "node-fetch";

import Discord = require("discord.js");
import { CommandHandler } from "./CommandHandler";

interface QuestionData {
    uuid: number;
    requester: string | null,
    authorId: string;
    authorName: string,
    question: string;
}

interface OfficeHoursData {
    questions: QuestionData[];
    isOpen: boolean;
    lastCloseMessage: string;
    nextId: number;
}

export default class OfficeHours extends CommandHandler {
    private data: OfficeHoursData;
    private sharedSettings: SharedSettings;

    private guild: Discord.Guild;

    constructor(sharedSettings: SharedSettings, officeHoursData: string) {
        super();
        console.log("Requested OfficeHours extension..");

        this.data = fileBackedObject(officeHoursData);
        console.log("Successfully question file.");

        this.sharedSettings = sharedSettings;

        // this.bot.on("channelUpdate", this.onChannelUpdate.bind(this));
    }

    onReady(bot: Discord.Client) {
        const mainGuild = bot.guilds.get(this.sharedSettings.server);
        if (!mainGuild) {
            console.warn(`Cannot determine main guild (${this.sharedSettings.server}), isOpen state of OfficeHours could not be determined!`);
            return;
        }
        this.guild = mainGuild;

        const officeHoursChannel = mainGuild.channels.find("name", "office-hours");
        if (!officeHoursChannel) {
            console.warn(`Cannot determine office hours channel of "${mainGuild.name}", isOpen state of OfficeHours could not be determined!`);
            return;
        }

        const everyone = mainGuild.roles.find("name", "@everyone");
        let randomUser = mainGuild.members.find(x => x.roles.has(everyone.id) && x.roles.size === 1);
        this.data.isOpen = officeHoursChannel.permissionsFor(randomUser).has("SEND_MESSAGES");
        console.log(`OfficeHours extension loaded (${this.data.isOpen ? "open" : "closed"}).`);
    }

    storeQuestion(question: string, message: Discord.Message, authorId: string, authorName: string, requester: string | null = null) {

        const questionData = {
            requester: requester,
            authorId: authorId,
            authorName: authorName,
            question: question,
            uuid: ++this.data.nextId
        };

        this.data.questions.push(questionData);
        message.reply(this.sharedSettings.officehours.addedMessage);

        const moderatorChannel = this.guild.channels.find("name", "moderators");
        if (moderatorChannel instanceof Discord.TextChannel) {
            moderatorChannel.send(`${authorName} just asked a question: \`${question}\`, you can remove it with \`!question_remove ${questionData.uuid}\``);
        }
    }

    onCommand(message: Discord.Message, command: string, args: string[]) {

        if (command === "ask") {
            const question = args.join(" ");
            this.storeQuestion(question, message, message.author.id, message.author.username);
        }

        const isAdmin = (message.member && findOne(message.member.roles, this.sharedSettings.officehours.allowedRoles));
        if (!isAdmin) {
            return;
        }

        if (command === "ask_for") {

            const asker = message.mentions.members.first();

            if (!asker) return;

            const question = args.slice(1).join(" ");
            this.storeQuestion(question, message, asker.id, asker.toString(), message.author.username);
            return;
        }


        if (command === "question_list") {

            for (const data of this.data.questions) {
                message.channel.send(`${data.uuid}: ${data.authorName}: ${data.question}`);
            }

            return;
        }


        if (command === "question_remove") {
            if (args.length === 1) {
                const id = +args[0];
                this.data.questions = this.data.questions.filter(q => q.uuid != id);
                message.reply(this.sharedSettings.officehours.removedMessage);
                return;
            }

            message.reply("Invalid use of command, use !question_remove {id}");
            return;
        }

        if (!(message.channel instanceof Discord.TextChannel) || message.channel.name !== "office-hours")
            return;

        if (command === "open") {
            message.delete();
            this.open(message.channel);
        }


        if (command === "close") {
            message.delete();
            this.close(message.channel);
        }
    }

    onChannelUpdate(oldChannel: Discord.TextChannel, newChannel: Discord.TextChannel) {

        if (newChannel.name !== "office-hours")
            return;

        const everyone = newChannel.guild.roles.find("name", "@everyone");
        let randomUser = newChannel.guild.members.find(x => x.roles.has(everyone.id) && x.roles.size === 1);
        const canSendMessages = newChannel.permissionsFor(randomUser).has("SEND_MESSAGES");
        if (canSendMessages && !this.data.isOpen)
            this.open(newChannel);
        else if (canSendMessages && this.data.isOpen)
            this.close(newChannel);
    }

    sendOnThisDayMessage(channel: Discord.TextChannel) {

        const onThisDayMsg = fetch('https://history.muffinlabs.com/date')
            .then(r => r.json())
            .then(({ data: { Events } }) => Events[Math.floor(Math.random() * Events.length)])
            .then(event => {
                channel.send(`On this day in ${event.year}, ${event.text}`);
            })
            .catch(r => console.warn('Failed to fetch message of the day: ' + r));
    }

    async open(channel: Discord.TextChannel) {
        if (this.data.isOpen) return;
        this.data.isOpen = true;

        const everyone = channel.guild.roles.find("name", "@everyone");
        await channel.overwritePermissions(everyone, { 'SEND_MESSAGES': true });


        // Start with open message
        channel.send(this.sharedSettings.officehours.openMessage);

        // Add all questions with mention
        for (const data of this.data.questions) {
            const member = channel.guild.members.get(data.authorId);
            const mention = member ? member : data.authorName;

            channel.send(`${mention} asked ${data.requester ? `(via ${data.requester})` : ""}: \`\`\`${data.question}\`\`\``);
        }

        this.data.questions = [];
        this.data.nextId = 0;

        if (!this.data.lastCloseMessage) return;

        // Request last close message from Discord
        channel.fetchMessage(this.data.lastCloseMessage)
            .then(closeMessage => {
                // Find all users that raised their hand
                const reactions = closeMessage.reactions.get("✋");
                if (reactions) {
                    const usersToMention = reactions.users.array().filter(user => !user.bot);
                    if (usersToMention.length > 0)
                        channel.send(usersToMention.join(", ") + "\n");
                }

                this.sendOnThisDayMessage(channel);
            })
            .catch(reason => {
                console.warn("Failed getting last close message: " + reason);
                this.sendOnThisDayMessage(channel);
            });
    }

    async close(channel: Discord.TextChannel) {
        if (!this.data.isOpen) return;
        this.data.isOpen = false;

        const everyone = channel.guild.roles.find("name", "@everyone");
        await channel.overwritePermissions(everyone, { 'SEND_MESSAGES': false });


        channel.send(this.sharedSettings.officehours.closeMessage.replace(/{botty}/g, this.sharedSettings.botty.nickname))
            .then(message => {
                if (Array.isArray(message)) {
                    message = message[0];
                }

                this.data.lastCloseMessage = message.id;
                message.react("✋");
            });
    }
}


const findOne = (arr1: Discord.Collection<string, Discord.Role>, arr2: Array<any>) => {
    return arr2.some(x => arr1.has(x));
};