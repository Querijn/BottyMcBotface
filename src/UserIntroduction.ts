import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";
import CommandController from "./CommandController";

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
    }

    onUser(user: Discord.GuildMember | Discord.PartialGuildMember) {
        user.roles.add(this.role);
    }

    async onReaction(messageReaction: Discord.MessageReaction, user: Discord.User) {
        if (!this.ruleMessages.some(m => m.id === messageReaction.message.id) || !this.channel)
            return;

        const member = await this.channel.members.find(u => u.id == user.id)?.fetch();
        const hasRole = member?.roles.cache.some(r => r.id == this.role.id);
        if (!hasRole)
            return;

        for (let message of this.ruleMessages) {
            message = await message.fetch();
            const hasAcceptedArray = message.reactions.cache.map(async r => {
                const users = await (await r.fetch()).users.fetch();
                return users.some(u => u.id === user.id);
            });
            const hasAccepted = (await Promise.all(hasAcceptedArray)).some(b => b);

            if (!hasAccepted)
                return;
        }

        // If we're here, the user accepted all messages
        if (member) {
            member.roles.remove(this.role);
            this.sendWelcome(member);
        }
        else {
            console.error(`Unable to remove role from ${user.username}, because he seems to be unable to be fetched as a member?`);
        }
    }

    private async writeAllRules(channel: Discord.TextChannel) {
        channel.bulkDelete(100);

        for (let line of this.sharedSettings.userIntro.lines) {
            const message = await channel.send(line.lineTranslation["default"]);
            this.data.messages[line.id] = message.id;

            if (line.type == "rule")
                await message.react('✅');
        }
    }

    private async setupChannel(guild: Discord.Guild) {
        const channel = await guild.channels.create(this.sharedSettings.server.introChannel, { type: "text" });

        this.writeAllRules(channel);

        const roles = guild.roles.cache.array().reverse();
        for (let r of roles) {
            const isGuruOrNew = r.id == this.role.id || this.sharedSettings.commands.adminRoles.some(roleId => r.id == roleId);
            await channel.createOverwrite(r, { VIEW_CHANNEL: isGuruOrNew });
        }

        return channel;
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
                console.error(`UserIntroduction: Unable to find moderators channel!`);
                return;
            }
            else {
                channel = await this.setupChannel(guild);
            }
        }

        if (!(channel instanceof Discord.TextChannel)) {
            console.error(`UserIntroduction: channel is not a text channel!`);
            return;
        }
        this.channel = channel as Discord.TextChannel;

        // First check if all rules are present. If not, rewrite them. Then, link up our messages.
        const ruleMessages: {[id: string]: Discord.Message } = {};
        for (let i = 0; i < 2; i++) {
            for (let line of this.sharedSettings.userIntro.lines) {
                const messageId = this.data.messages[line.id];
                if (!messageId) {
                    if (i == 1)
                        console.error("Unexpected issue: Noticed rules aren't writing up correctly (missing rules). Linked messages aren't working.");
                    else
                        await this.writeAllRules(this.channel);
                    continue;
                }

                const message = ruleMessages[line.id] || await this.channel.messages.fetch(messageId);
                if (!ruleMessages[line.id] && line.type == "rule") // Store rules
                    ruleMessages[line.id] = message;
                if (message.content != line.lineTranslation["default"])
                    message.edit(line.lineTranslation["default"]);
            }

            break; // If we reach this point, everything's fine
        }

        this.ruleMessages = Object.values(ruleMessages);

        this.bot.on("messageReactionAdd", (messageReaction: Discord.MessageReaction, user: Discord.User) => this.onReaction(messageReaction, user));
        console.log("UserIntroduction extension loaded.");
    }
}
