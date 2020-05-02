import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";
import CommandController from "./CommandController";
const { performance } = require('perf_hooks');

import Discord = require("discord.js");
import fs = require("fs");

class UserIntroductionData {
    messages: { [id: string]: string }
};

interface UserSaveData {
    handled: boolean;
    rulesAccepted: { [lang: string]: string[] };
    firstRuleAccepted: number;
};

export default class UserIntroduction {
    private bot: Discord.Client;
    private sharedSettings: SharedSettings;
    private messageContents: string;
    private commandContents: Discord.MessageEmbed[];
    private commandController: CommandController;
    private channels: { [lang: string]: Discord.TextChannel | null } = {};
    private data: UserIntroductionData;
    private role: Discord.Role;
    private ruleMessages: { [lang: string]: Discord.Message[] } = {};
    private userSaveData: { [userId: string]: UserSaveData } = {};
    private languages: string[] = [];

    constructor(bot: Discord.Client, commandController: CommandController, sharedSettings: SharedSettings, dataFile: string) {
        console.log("Requested UserIntroduction extension..");
        this.bot = bot;

        this.sharedSettings = sharedSettings;
        this.data = fileBackedObject<UserIntroductionData>(dataFile);
        this.commandController = commandController;

        this.bot.on("ready", this.onBot.bind(this));
    }

    sendWelcome(user: Discord.GuildMember | Discord.PartialGuildMember) {
        user.send(this.messageContents)
            .then(() => this.commandContents.forEach(embed => user.send({ embed })))
            .catch((e) => console.log(`Error: Cannot send the welcome message to ${user.nickname} (${e})`));
        console.log(`Welcomed ${user.displayName}.`);
    }

    onUser(user: Discord.GuildMember | Discord.PartialGuildMember) {
        user.roles.add(this.role);
    }

    async onReaction(messageReaction: Discord.MessageReaction, user: Discord.User) {
        if (user.bot)
            return;

        const channel = Object.values(this.channels).find(c => c && c.id === messageReaction.message.channel.id);
        if (!channel) {
            console.log("Got a reaction, but the channel does not exist.");
            return;
        }

        // Get language
        let channelNameParts = channel.name.split("-");
        let channelLanguage = channelNameParts[channelNameParts.length - 1];

        let origNameParts = this.sharedSettings.server.introChannel.split("-"); // "new-users" -> "users" + "new-users-fr" -> "fr"
        channelLanguage = channelLanguage !== origNameParts[origNameParts.length - 1] ? channelLanguage : "default";

        // Check if it was a reaction to one of our rule messages
        const rule = this.ruleMessages[channelLanguage].find(m => m.id === messageReaction.message.id);
        if (!rule) {
            console.log(`Got a reaction and the channel, but could not find the rule belonging to the message "${messageReaction.message.content}".`);
            return;
        }

        this.channels[channelLanguage] = await channel.fetch();
        let member = await channel.members.find(u => u.id == user.id);
        if (!member) {
            console.error(`Unable to evaluate ${user.username}, because he seems to be unable to be found in the channel?`);
            return;
        }

        member = await member.fetch();

        // Did he have the role?
        const hasRole = member.roles.cache.some(r => r.id == this.role.id);
        if (!hasRole) {
            console.log(`${user.username} reacted to ${messageReaction.message.id} but he does not have the role. ${this.role.id} -> ${this.role.name}`);
            return;
        }

        // Initialise save data
        if (!this.userSaveData[user.id]) {
            this.userSaveData[user.id] = {
                handled: false,
                rulesAccepted: {},
                firstRuleAccepted: performance.now()
            };
        }
        if (!this.userSaveData[user.id].rulesAccepted[channelLanguage])
            this.userSaveData[user.id].rulesAccepted[channelLanguage] = [];
        this.userSaveData[user.id].rulesAccepted[channelLanguage].push(rule.id);
        const count = this.userSaveData[user.id].rulesAccepted[channelLanguage].length;

        console.log(`${user.username} accepted ${count}/${this.ruleMessages[channelLanguage].length} ${channelLanguage} rules.`);
        if (count != this.ruleMessages[channelLanguage].length)
            return;

        // If we're here, the user accepted all messages
        if (this.userSaveData[user.id] && this.userSaveData[user.id].handled) // Check if we've handled the user
            return;

        this.userSaveData[user.id].handled = true;

        const acceptUser = () => {
            if (!member) { // Typescript claims this can happen but I disagree
                console.error(`Member was undefined -> ${user.username}`);
                return;
            }

            console.log(`${user.username} was accepted to our server`);
            member.roles.remove(this.role);
            this.sendWelcome(member);
            delete this.userSaveData[user.id];
        }

        // See if we can fetch the time they accepted the first rule.
        const firstRuleAccepted = this.userSaveData[user.id].firstRuleAccepted;
        if (!firstRuleAccepted) {
            console.log(`Could not see when ${user.username} started accepting the rules.. Just accepting it, I guess.`);
            acceptUser();
            return;
        }

        // Calculate time taken
        const timeTaken = performance.now() - firstRuleAccepted;
        if (timeTaken > 30 * 1000) {
            console.log(`${user.username} took ${timeTaken / 1000} seconds to read all the rules, instantly accepting him.`);
            acceptUser();
            return;
        }

        // If they took less than 30 seconds, impose a penalty twice the duration of what they had left to wait.
        const timePenalty = (30 * 1000 - timeTaken) * 2; // Basically, wait out the rest, but twice as long.
        console.log(`${user.username} was pretty fast on reading all the rules (${timeTaken / 1000} seconds), so we're accepting him into the server in ${timePenalty / 1000} seconds.`);
        const message = await channel.send(`${user}, you were pretty fast with reading all those rules! I'll add you in a bit, make sure you read all the rules!`);
        setTimeout(() => {
            message.delete();
            acceptUser();
        }, timePenalty);
    }

    private async writeAllRules(language: string, channel: Discord.TextChannel) {
        try {
            await channel.bulkDelete(100);
        }
        catch (e) {
            console.error(`Unable to delete all messages in ${channel.name}`);
        }

        // First link all the channels
        let firstMessage = "";
        for (let otherLanguage of this.languages)
            if (otherLanguage != language)
               firstMessage += `${this.sharedSettings.userIntro.icon[otherLanguage]} => ${this.channels[otherLanguage]}\n`;
        await channel.send(firstMessage);

        const messages: { [id: string]: Discord.Message } = {};
        for (let line of this.sharedSettings.userIntro.lines) {
            const message = await channel.send(line.lineTranslation[language]);
            this.data.messages[line.id] = message.id;
            messages[line.id] = message;

            if (line.type == "rule")
                await message.react('✅');
        }

        return messages;
    }

    public async onBot() {
        this.messageContents = fs.readFileSync(this.sharedSettings.onJoin.messageFile, "utf8").toString();
        this.commandContents = this.commandController.getHelp();

        fs.copyFileSync(this.sharedSettings.onJoin.messageFile, "www/" + this.sharedSettings.onJoin.messageFile);

        this.bot.on("guildMemberAdd", (u) => this.onUser(u));

        const guild = this.bot.guilds.cache.get(this.sharedSettings.server.guildId);
        if (!guild) {
            console.error(`UserIntroduction: Unable to find server with ID: ${this.sharedSettings.server}`);
            return;
        }

        let role: Discord.Role | undefined;
        if (this.sharedSettings.userIntro.role.id)
            role = guild.roles.cache.get(this.sharedSettings.userIntro.role.id);

        if (!role) {
            role = guild.roles.cache.find((r) => r.name === this.sharedSettings.userIntro.role.name);
            if (!role) {
                console.error(`UserIntroduction: Unable to find the role!`);
                return;
            }

            console.log("New user role id = " + role.id);
        }
        this.role = role;

        // Count all translated lines.
        const languages: { [lang: string]: number } = {};
        for (let line of this.sharedSettings.userIntro.lines) {
            for (let language of Object.keys(line.lineTranslation)) {
                if (!languages[language])
                    languages[language] = 1;
                else
                    languages[language]++;
            }
        }
        if (!Object.values(languages).every(e => e == this.sharedSettings.userIntro.lines.length)) {
            let message = "";
            for (let [key, value] of Object.entries(languages))
                message += `${key}: ${value}`;
            console.error(`UserIntroduction: Missing some translations! Counts => ${message}`);
            return;
        }
        this.languages = Object.keys(languages);

        for (let language in languages) {
            let channelName = this.sharedSettings.server.introChannel;
            if (language != "default")
                channelName += "-" + language;

            let channel = guild.channels.cache.find(c => c.name === channelName);
            if (!channel) {
                console.error(`UserIntroduction: Unable to find user intro channel ${channelName}!`);
                return;
            }

            if (!(channel instanceof Discord.TextChannel)) {
                console.error(`UserIntroduction: channel is not a text channel!`);
                return;
            }
            this.channels[language] = channel as Discord.TextChannel;
        }

        for (let language in languages) {
            let channelName = this.sharedSettings.server.introChannel;
            if (language != "default")
                channelName += "-" + language;

            const channel = this.channels[language];
            if (!channel) {
                console.error(`UserIntroduction: Unable to find user intro channel ${channelName} after fetching them!`);
                return;
            }

            // Link up our messages.
            const ruleMessages = await this.writeAllRules(language, channel);
            for (let line of this.sharedSettings.userIntro.lines) {
                const messageId = this.data.messages[line.id];
                if (!messageId) {
                    console.error("Unexpected issue: Noticed rules aren't writing up correctly (missing rules). Linked messages aren't working.");
                    this.channels[language] = null;
                    return;
                }

                let message = ruleMessages[line.id];

                if (!message) {
                    console.error("Unexpected issue: Noticed rules aren't writing up correctly (missing rules). Linked messages aren't working.");
                    this.channels[language] = null;
                    return;
                }

                if (line.type != "rule") // Just store rules rules
                    delete ruleMessages[line.id];
            }

            this.ruleMessages[language] = Object.values(ruleMessages);
        }

        this.bot.on("messageReactionAdd", (messageReaction: Discord.MessageReaction, user: Discord.User) => this.onReaction(messageReaction, user));
        console.log(`UserIntroduction extension loaded. ${this.ruleMessages.length} rule messages are added: (${this.ruleMessages["default"].map(r => r.id).join(", ")})\n\n${this.ruleMessages["default"].join("\n")}`);
    }
}
