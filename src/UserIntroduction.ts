import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";
import CommandController from "./CommandController";
const { performance } = require('perf_hooks');

import Discord = require("discord.js");
import fs = require("fs");

class UserIntroductionData {
    messages: {[id: string]: string }
};

export default class UserIntroduction {
    private bot: Discord.Client;
    private sharedSettings: SharedSettings;
    private messageContents: string;
    private commandContents: Discord.MessageEmbed[];
    private commandController: CommandController;
    private channel: Discord.TextChannel | null = null;
    private data: UserIntroductionData;
    private role: Discord.Role;
    private ruleMessages: Discord.Message[] = [];
    private firstRuleAccepted: {[userId: string]: number } = {};
    private usersHandled: {[userId: string]: boolean } = {};

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
        if (this.channel) // Only add if the channel exists
            user.roles.add(this.role);
    }

    async onReaction(messageReaction: Discord.MessageReaction, user: Discord.User) {
        if (user.bot)
            return;

        if (!this.channel) {
            console.log("Got a reaction, but the channel does not exist.");
            return;
        }

        if (!this.ruleMessages.some(m => m.id === messageReaction.message.id)){
            console.log(`${user.username} reacted to ${messageReaction.message.id}, which is not part of one of our ${this.ruleMessages.length} rules. (It said: "${messageReaction.message.content}")`);
            return;
        }

        const member = await this.channel.members.find(u => u.id == user.id)?.fetch();
        const hasRole = member?.roles.cache.some(r => r.id == this.role.id);
        if (!hasRole) {
            console.log(`${user.username} reacted to ${messageReaction.message.id} but he does not have the role. ${this.role.id} -> ${this.role.name}`);
            return;
        }

        const ruleIndex = this.ruleMessages.findIndex(m => m.id === messageReaction.message.id);
        let count = 0;
        for (let message of this.ruleMessages) {
            const hasAcceptedArray = message.reactions.cache.map(async r => {
                const users = await (await r.fetch()).users.fetch();
                return users.some(u => u.id === user.id);
            });
            const hasAccepted = (await Promise.all(hasAcceptedArray)).some(b => b);

            if (hasAccepted) {
                count++;
            }
        }

        if (!this.firstRuleAccepted[user.id])
            this.firstRuleAccepted[user.id] = performance.now();

        console.log(`${user.username} accepted ${count}/${this.ruleMessages.length} rules.`);
        if (count != this.ruleMessages.length)
            return;

        // If we're here, the user accepted all messages
        if (!member) {
            console.error(`Unable to remove role from ${user.username}, because he seems to be unable to be fetched as a member?`);
            return;
        }

        if (this.usersHandled[user.id]) // Check if we've handled the user
            return;
        this.usersHandled[user.id] = true;

        const acceptUser = () => {
            console.log(`${user.username} was accepted to our server`);
            member.roles.remove(this.role);
            this.sendWelcome(member);
        }

        // See if we can fetch the time they accepted the first rule.
        const firstRuleAccepted = this.firstRuleAccepted[user.id];
        if (!firstRuleAccepted) {
            console.log (`Could not see when ${user.username} started accepting the rules.. Just accepting it, I guess.`);
            acceptUser();
            return;
        }

        // Calculate time taken and free the memory.
        const timeTaken = performance.now() - firstRuleAccepted;
        delete this.firstRuleAccepted[user.id];

        if (timeTaken > 30 * 1000) {
            console.log (`${user.username} took ${timeTaken / 1000} seconds to read all the rules.`);
            acceptUser();
            return;
        }

        // If they took less than 30 seconds, impose a penalty twice the duration of what they had left to wait.
        const timePenalty = (30 * 1000 - timeTaken) * 2; // Basically, wait out the rest, but twice as long.
        console.log (`${user.username} was pretty fast on reading all the rules (${timeTaken / 1000} seconds), so we're accepting him into the server in ${timePenalty / 1000} seconds.`);
        const message = await this.channel?.send(`${user}, you were pretty fast with reading all those rules! I'll add you in a bit, make sure you read all the rules!`);
        setTimeout(() => {
            message.delete();
            acceptUser();
        }, timePenalty);
    }

    private async writeAllRules(channel: Discord.TextChannel) {
        channel.bulkDelete(100);

        const messages: {[id: string]: Discord.Message } = {};
        for (let line of this.sharedSettings.userIntro.lines) {
            const message = await channel.send(line.lineTranslation["default"]);
            this.data.messages[line.id] = message.id;
            messages[line.id] = message;

            if (line.type == "rule")
                await message.react('✅');
        }

        return messages;
    }

    private async setupChannel(guild: Discord.Guild) {
        try {
            const channel = await guild.channels.create(this.sharedSettings.server.introChannel, { type: "text" });
    
            const roles = guild.roles.cache.array().reverse();
            for (let r of roles) {
                const isGuruOrNew = r.id == this.role.id || this.sharedSettings.commands.adminRoles.some(roleId => r.id == roleId);
                await channel.createOverwrite(r, { VIEW_CHANNEL: isGuruOrNew });
            }
    
            return channel;
        }
        catch (e) {
            console.error(`Error occurred during setup of new user channel: ${e}`);
        }
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

        let channel = guild.channels.cache.find(c => c.name === this.sharedSettings.server.introChannel);
        if (!channel) {
            if (this.sharedSettings.botty.isProduction) {
                console.error(`UserIntroduction: Unable to find user intro channel!`);
                return;
            }
            else {
                channel = await this.setupChannel(guild);
                if (this.sharedSettings.botty.isProduction) {
                    console.error(`UserIntroduction: Unable to create user intro channel!`);
                    return;
                }
            }
        }

        if (!(channel instanceof Discord.TextChannel)) {
            console.error(`UserIntroduction: channel is not a text channel!`);
            return;
        }
        this.channel = channel as Discord.TextChannel;

        // Link up our messages.
        const ruleMessages = await this.writeAllRules(this.channel);
        for (let line of this.sharedSettings.userIntro.lines) {
            const messageId = this.data.messages[line.id];
            if (!messageId) {
                console.error("Unexpected issue: Noticed rules aren't writing up correctly (missing rules). Linked messages aren't working.");
                this.channel = null;
                return;
            }

            let message = ruleMessages[line.id];

            if (!message) {
                console.error("Unexpected issue: Noticed rules aren't writing up correctly (missing rules). Linked messages aren't working.");
                this.channel = null;
                return;
            }

            if (line.type != "rule") // Just store rules rules
                delete ruleMessages[line.id];
        }

        this.ruleMessages = Object.values(ruleMessages);

        this.bot.on("messageReactionAdd", (messageReaction: Discord.MessageReaction, user: Discord.User) => this.onReaction(messageReaction, user));
        console.log(`UserIntroduction extension loaded. ${this.ruleMessages.length} rule messages are added: (${this.ruleMessages.map(r => r.id).join(", ")})\n\n${this.ruleMessages.join("\n")}`);
    }
}
