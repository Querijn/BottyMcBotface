import { fileBackedObject } from "./FileBackedObject";
import { SharedSettings } from "./SharedSettings";
import { clearTimeout, setTimeout } from "timers";

import Discord = require("discord.js");
import prettyMs = require("pretty-ms");
import joinArguments from "./JoinArguments";
import Info from "./Info";

class TicketData {

    public dateString: string;
    public reason: string;

    constructor(reason: string) {
        this.reason = reason;
        this.dateString = new Date().toString();
    }

    public getDate() {
        return new Date(this.dateString);
    }
}

class MuteData {

    public muterId: string;
    public unmuteDateString: string;
    public reason: string;

    constructor(muterId: string, reason: string, unmuteDate: Date) {
        this.muterId = muterId;
        this.reason = reason;
        this.unmuteDateString = unmuteDate.toString();
    }

    public getUnmuteDate() {
        return new Date(this.unmuteDateString);
    }

}

class AdminData {

    public tickets: { [userId: string]: TicketData[] };
    public muted: { [userId: string]: MuteData | null; };

    constructor() {
        this.tickets = {};
        this.muted = {};
    }
}

export default class Admin {
    private bot: Discord.Client;
    private adminChannel: Discord.TextChannel | null = null;
    private adminLogChannel: Discord.TextChannel | null = null;
    private sharedSettings: SharedSettings;
    private data: AdminData;
    private muteRole: Discord.Role;
    private muteTimers: { [id: string]: NodeJS.Timer } = {};
    private notes: Info;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings, dataFile: string, notes: Info) {
        console.log("Requested Admin extension..");
        this.bot = bot;
        this.notes = notes;

        this.sharedSettings = sharedSettings;
        this.data = fileBackedObject<AdminData>(dataFile);

        this.bot.on("ready", this.onBot.bind(this));
    }

    public get channel() { return this.adminChannel; }

    public async onBot() {
        const guild = this.bot.guilds.cache.get(this.sharedSettings.server.guildId);
        if (!guild) {
            console.error(`Admin: Unable to find server with ID: ${this.sharedSettings.server}`);
            return;
        }

        let adminChannel = guild.channels.cache.find(c => c.name === this.sharedSettings.server.guruChannel);
        let adminLogChannel = guild.channels.cache.find(c => c.name === this.sharedSettings.server.guruLogChannel)
        if (!adminChannel) {
            if (this.sharedSettings.botty.isProduction) {
                console.error(`Admin: Unable to find moderators channel!`);
                return;
            }
            else {
                adminChannel = await guild.channels.create({name: this.sharedSettings.server.guruChannel, type: Discord.ChannelType.GuildText});
            }
        }
        if (!adminLogChannel) {
            try {
                if (this.sharedSettings.botty.isProduction) {
                    console.error(`Admin: Unable to find moderator log channel!`);
                    return;
                }
                adminLogChannel = await guild.channels.create({name: this.sharedSettings.server.guruLogChannel, type: Discord.ChannelType.GuildText});
            } catch {
                adminLogChannel = adminChannel;
            }
        }

        if (!(adminChannel instanceof Discord.TextChannel)) {
            console.error(`Admin: Unexpected; moderators channel is not a text channel!`);
            return;
        }

        let muteRole: Discord.Role | undefined;
        if (this.sharedSettings.admin.muteRoleId)
            muteRole = guild.roles.cache.get(this.sharedSettings.admin.muteRoleId);

        if (!muteRole) {
            muteRole = guild.roles.cache.find((r) => r.name === this.sharedSettings.admin.muteRoleName);
            if (!muteRole) {
                console.error(`Admin: Unable to find the muted role!`);
                return;
            }

            console.log("Mute role id = " + muteRole.id);
        }
        this.muteRole = muteRole;

        this.adminChannel = adminChannel as Discord.TextChannel;
        this.adminLogChannel = adminLogChannel as Discord.TextChannel;
        console.log("Admin extension loaded.");

        for (const id in this.data.muted) {
            this.handleMuteData(id);
        }

        this.bot.on("guildMemberAdd", (user: Discord.GuildMember) => {
            this.handleMuteData(user.id);
        });
    }

    private async deleteNonAdminChannelMessage(message: Discord.Message) {
        if (!this.sharedSettings.admin.keepAdminCommandsChannels.includes(message.channel.id)) {
            if (message.deletable) {
                try {
                    await message.delete();
                } catch (e) {
                    console.log(`Failed to delete message (https://discordapp.com/channels/${message.guild?.id}/${message.channel.id}/${message.id}): ${e}`);
                }
            }
        }
    }


    public async handleMultiUserArguments(message: Discord.Message, args: string[]) {

        let streak = 0;
        function isSnowflake(string: string) {
            return /^[0-9]{1,}$/.test(string);
        }

        let members: Discord.GuildMember[] = []
        for (let i = 0; i < args.length; i++) {
            const argument = args[i];
            const snowflake = isSnowflake(argument);

            if (/^\<\@[0-9]{1,}\>$/.test(argument) || snowflake) {
                streak++;

                const id = (snowflake === false) ? argument.substring(2, argument.length - 1) : argument;
                try {
                    let member = this.muteRole.guild.members.cache.find(cachedMember => cachedMember.id === id);
                    if (!member) member = await this.muteRole.guild.members.fetch(id);
                    if (this.sharedSettings.commands.adminRoles.some(x => member!.roles.cache.has(x))) {
                        continue; // better not ban/kick admins here
                    }

                    members.push(member);
                } catch (e) {
                    console.log(e)
                    // invalid user
                }
                continue;
            }
            break;
        };

        let argumentsWithoutUsers = args.slice(streak);

        let reason = this.handleReason(argumentsWithoutUsers.join(" "));

        return {
            members,
            reason
        }

    }

    public handleReason(reason: string) {
        if (reason.length <= 0) return ""

        if (reason.charAt(0) === ".") {
            const noteReason = this.notes.fetchInfo(reason.split(" ")[0].substring(1), true)
            if (noteReason !== null) {
                const rest = reason.split(" ").slice(1).join(" ")
                return noteReason.message + ((rest.length > 0) ? "\n" + rest : "");
            }
        }

        return reason;
    }


    public getDMEmbed(reason: string, action: "banned" | "kicked", message: Discord.Message) {

        function capitalizeFirstLetter(string: string) {
            return string.charAt(0).toUpperCase() + string.slice(1);
        }

        const iconUrl = message.guild?.iconURL() || "https://upload.wikimedia.org/wikipedia/commons/1/19/Stop2.png";
        const serverName = message.guild?.name || "Botty McBotface"

        return new Discord.EmbedBuilder()
            .setTitle(`${capitalizeFirstLetter(action)} - ${serverName}`)
            .setColor(0xff0000)
            .setThumbnail(iconUrl)
            .setDescription(`You were ${action} from the ${serverName}. \n\n**Reason**\n${reason}`)
    }

    private async logSuccessMessage(message: Discord.Message, member: Discord.GuildMember, note: string, reason: string, words: string[]) {
        // logging
        if (reason.length > 0) {
            this.replySecretMessage(message, `${member} was ${words[1]} by ${message.author.username} due to "${reason}". ${note}`);
        } else {
            this.replySecretMessage(message, `${member} was ${words[1]} by ${message.author.username}. ${note}`);
        }
    }

    private async banKick(message: Discord.Message, isAdmin: boolean, args: string[], action: "kick" | "ban") {

        // only admins should ban, there should always be at least 1 argument
        if (!isAdmin || args.length === 0) {
            return;
        }

        // get all members and a ban reason, if set
        const { members, reason } = await this.handleMultiUserArguments(message, args);


        // set the words based on the action
        const words = (action === "kick") ? ["kick", "kicked", "kickable"] : ["ban", "banned", "bannable"];
        if (members.length === 0) { return; }

        let removed = 0;
        for (let i = 0; i < members.length; i++) {
            const member = members[i];
            let note = `The user was not informed as no ${words[0]} message was given. `;

            // check if eligible to kick/ban
            if (
                (action === "kick" && !member.kickable) ||
                (action === "ban" && !member.bannable)
            ) {
                this.replySecretMessage(message, `${member} is not ${words[2]}. `);
                continue;
            }

            // try to send the reason to the user. The reason needs to be delivered before the user is removed from the server
            if (reason.length > 0) {
                note = `The user received their ${words[0]} message. `;
                await member.send({ embeds: [this.getDMEmbed(reason, words[1] === "kicked" ? "kicked" : "banned", message)] }).catch(e => {
                    note = `The user did not receive their ${words[0]} message. `
                });
            }

            if (action === "ban") {
                await member.ban({ reason: (reason.length > 0 ? this.shorten(reason) : "No reason") + " -" + message.author.username })
                    .then(() => { this.logSuccessMessage(message, member, note, reason, words); removed++ })
                    .catch((e) => this.replySecretMessage(message, `Failed to ${words[0]} ${member}: ${e}`));
            } else if (action === "kick") {
                await member.kick((reason.length > 0 ? this.shorten(reason) : "No reason") + " -" + message.author.username)
                    .then(() => { this.logSuccessMessage(message, member, note, reason, words); removed++ })
                    .catch((e) => this.replySecretMessage(message, `Failed to ${words[0]} ${member}: ${e}`));
            }
        }

        // purge log
        if (members.length > 1) {
            this.replySecretMessage(message, `${message.author.username} has ${words[1]} ${removed} users. `);
        }

        await this.deleteNonAdminChannelMessage(message);

    }

    private shorten(string: string) {
        if (string.length > 400) {
            return string.slice(0, 400) + "..."
        }
        return string;
    }

    public async onBan(message: Discord.Message, isAdmin: boolean, command: string, args: string[], separators: string[]) {

        this.banKick(message, isAdmin, args, "ban");

    }

    public async onKick(message: Discord.Message, isAdmin: boolean, command: string, args: string[], separators: string[]) {

        this.banKick(message, isAdmin, args, "kick");

    }

    public async onMute(message: Discord.Message, isAdmin: boolean, command: string, args: string[], separators: string[]) {

        const reason = joinArguments(args, separators);

        const muteAddedFor = [];

        if (message.mentions.members) {
            for (const [id, cachedMember] of message.mentions.members) {
                const member = await this.muteRole.guild.members.fetch(id);
                if (this.sharedSettings.commands.adminRoles.some(x => member.roles.cache.has(x)))
                    continue;

                muteAddedFor.push(await this.mute(message, member, reason));
            }
        }

        if (muteAddedFor.length > 0) {
            const mentions = message.mentions.members || new Discord.Collection<string, Discord.GuildMember>();
            this.addTicket(mentions, null, `${message.author.username} muted ${muteAddedFor.join("/")} (message: ${reason})`);
            this.replySecretMessage(message, `I have muted ${muteAddedFor.join("/")}.`);
        }
        else {
            this.replySecretMessage(message, `No one you mentioned can be muted.`);
        }
    }

    public async onUnmute(message: Discord.Message, isAdmin: boolean, command: string, args: string[]) {

        if (message.mentions.members == null)
            return;

        const unmutedUsers = [];
        for (const [id, member] of message.mentions.members) {
            const userName = await this.unmute(id);
            if (userName) unmutedUsers.push(userName);
        }

        if (unmutedUsers.length === 0)
            this.replySecretMessage(message, `No one you mentioned seems muted.`);
    }

    public async onTicket(message: Discord.Message, isAdmin: boolean, command: string, args: string[], separators: string[]) {

        let mentions = message.mentions.members;
        if (mentions == null)
            return;

        if (args[0] === "add") {
            this.addTicket(mentions, message, joinArguments(args, separators, 1));
            return;
        }

        if (mentions.size === 0 && message.member) {
            mentions = new Discord.Collection<string, Discord.GuildMember>();
            mentions.set(message.author.id, message.member);
        }

        const tickets: string[] = [];

        for (const [id, member] of mentions) {

            if (!this.data.tickets[id])
                continue;
            const ticketData = this.data.tickets[id];

            for (const ticket of ticketData)
                tickets.push(`\`${new Date(ticket.dateString).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}\`: ${ticket.reason}`);
        }

        const ticketMessage = tickets.length > 0 ?
            `I have the following tickets for ${mentions.map(u => u.user.username).join("/")}: \n${tickets.join("\n")}` :
            `I have no tickets for ${mentions.map(u => u.user.username).join("/")}.`;

        this.replySecretMessage(message, ticketMessage);
    }

    private async handleMuteData(id: string) {

        const data = this.data.muted[id];
        if (!data)
            return;

        const user = await this.bot.users.fetch(id);
        if (user) {
            const guildmember = this.adminLogChannel!.guild.members.cache.get(id);
            if (guildmember) {
                await guildmember.roles.add(this.muteRole);
            }
        }
        const diff = new Date(data.unmuteDateString).getTime() - new Date().getTime();
        if (diff < 0) {
            this.unmute(id);
            return;
        }

        console.log(`${id} will be unmuted ${prettyMs(diff, { verbose: true })} from now.`);

        const maxTimeout = 1000 * 60 * 60 * 24 * 24; // 24 days
        this.muteTimers[id] = setTimeout(() => {
            delete this.muteTimers[id];
            this.handleMuteData(id);
        }, diff > maxTimeout ? maxTimeout : diff);
    }

    private async mute(message: Discord.Message, member: Discord.GuildMember, reason: string): Promise<string> {
        const ticketCount = this.data.tickets[member.id] ? this.data.tickets[member.id].length : 1;
        const muteTimeout = this.sharedSettings.admin.muteTimeout * (ticketCount * ticketCount);

        this.data.muted[member.id] = new MuteData(message.author.id, reason, new Date((new Date()).getTime() + muteTimeout));
        await member.roles.add(this.muteRole);

        this.handleMuteData(member.id);
        return member.user.username;
    }

    private async unmute(id: string): Promise<string | null> {

        const data = this.data.muted[id];
        if (!data)
            return null;

        const member = await this.bot.users.fetch(id);

        try {
            const serverUser = await this.muteRole.guild.members.fetch(id);
            await serverUser.roles.remove(this.muteRole);
            console.log("Removed mute role from " + serverUser.user.username);
        } catch (e) {
            console.log(`${member.username} has left the server, so we are unable to remove their role`);
        }

        if (this.adminLogChannel) {
            const muter = await this.muteRole.guild.members.fetch(data.muterId);
            this.adminLogChannel.send(`${muter}, I just unmuted ${member.username}.`);
        }

        if (this.muteTimers[id]) {
            clearTimeout(this.muteTimers[id]);
            delete this.muteTimers[id];
        }

        if (this.data.muted[id]) {
            this.data.muted[id] = null;
        }

        return member.username;
    }

    private async replySecretMessage(message: Discord.Message, reply: string) {

        if (!this.adminLogChannel) {
            message.author.send(reply).catch(e => {
                console.log("Admin: Could not DM " + message.author.username + ".");
                message.reply("I cannot send you a direct message, and there's no admin channel I can use.. Can't really give you this info.");
            });
        }
        else if (message.channel.id === this.adminLogChannel.id) {
            this.adminLogChannel.send(reply);
        }
        else { // If redirected to another channel, mention the author

            if (reply.charAt(0) !== "I" || reply.charAt(1) !== " ")
                reply = reply.charAt(0).toLowerCase() + reply.substring(1);
            this.adminLogChannel.send(message.author.username + ", " + reply);
        }
    }

    private async addTicket(users: Discord.Collection<string, Discord.GuildMember>, message: Discord.Message | null, reason: string) {

        const ticketAddedFor = [];
        for (const [id, member] of users) {

            if (!this.data.tickets[id])
                this.data.tickets[id] = [];

            this.data.tickets[id].push(new TicketData(reason));
            ticketAddedFor.push(member.user.username);
        }

        if (message)
            this.replySecretMessage(message, `I have added a ticket for ${ticketAddedFor.length > 0 ? ticketAddedFor.join("/") : "nobody"}.`);
    }
}
