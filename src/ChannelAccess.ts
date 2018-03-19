import { CommandHandler } from "./CommandHandler";
import { fileBackedObject } from "./FileBackedObject";
import { PersonalSettings } from "./PersonalSettings";
import { SharedSettings } from "./SharedSettings";

import Discord = require("discord.js");

export default class ChannelAccess extends CommandHandler {
    private sharedSettings: SharedSettings;
    private bot: Discord.Client;
    private guild: Discord.Guild;

    constructor(bot: Discord.Client, sharedSettings: SharedSettings) {
        super();
        console.log("Requested ChannelAccess extension..");

        this.sharedSettings = sharedSettings;
        console.log("Successfully loaded ChannelAccess settings file.");
    }

    public onReady(bot: Discord.Client): void {
        const guild = this.bot.guilds.get(this.sharedSettings.server);
        if (!guild) {
            console.error(`ChannelAccess: Invalid settings for guild ID ${this.sharedSettings.server}`);
            return;
        }
        this.guild = guild;
    }

    public onCommand(message: Discord.Message, command: string, args: string[]) {

        /** The specified name of the channel the user is trying to join/leave */
        let channelName: string | undefined;
        /** The channel the user is trying to join/leave */
        let channelActor: Discord.Channel | undefined;

        // "!leave" (with no argument) will leave the channel the user sent the message in
        if (args.length === 0) {
            if (command === "join") {
                this.reply(message, "You must specify a channel to join");
                return;
            }

            if (message.channel.type !== "text") {
                this.reply(message, "You must specify a channel to leave when using this command in DMs");
                return;
            }

            channelActor = message.channel;
        } else {
            channelName = args[0];
            // Remove "#" if the user prefixed the channel name with one
            if (channelName.startsWith("#")) {
                channelName = channelName.slice(1);
            }

            channelActor = this.guild.channels.find("name", channelName);
        }

        if (!channelActor) {
            // TODO list available channels?
            this.reply(message, `Channel "${channelName}" does not exist`);
            return;
        }

        if (message.channel.type !== "text") {
            this.reply(message, "You may only join/leave text channels");
            return;
        }

        if (command === "join") {
            this.joinChannel(message, message.channel as Discord.TextChannel);
        } else if (command === "leave") {
            this.leaveChannel(message, message.channel as Discord.TextChannel);
        }
    }

    /**
     * Tries to add a user to a channel, informing them of any problems that occur.
     *
     * @param message The message the user sent to initiate the action. This is used to determine who will be added to the channel, and to reply to the user if any issues occur.
     * @param channel The channel to add the user to. This channel is a valid text channel on the correct server.
     */
    private async joinChannel(message: Discord.Message, channel: Discord.TextChannel) {
        try {
            if (this.sharedSettings.channelAccess.restrictedChannels.indexOf(channel.id) !== -1) {
                await this.reply(message, `You are not allowed to join ${channel}`);
                return;
            }
            const permissions: Discord.Permissions = channel.permissionsFor(message.author);
            if (permissions && permissions.has("READ_MESSAGES")) {
                await this.reply(message, `You are already in ${channel}`);
                return;
            }
            await channel.overwritePermissions(message.author, { READ_MESSAGES: true });
            await this.reply(message, `You have joined ${channel}`, true);
        } catch (error) {
            console.error(`Error occured while adding ${message.author} to ${channel}: ${error}`);
            await this.reply(message, "An unknown error occurred");
        }
    }

    /**
     * Tries to remove a user from a channel, informing them of any problems that occur.
     *
     * @param message The message the user sent to initiate the action. This is used to determine who will be removed from the channel, and to reply to the user if any issues occur.
     * @param channel The channel remove the user from. This channel is a valid text channel on the correct server.
     */
    private async leaveChannel(message: Discord.Message, channel: Discord.TextChannel) {
        try {
            if (this.sharedSettings.channelAccess.forcedChannels.indexOf(channel.id) !== -1) {
                await this.reply(message, `You may not leave ${channel}`);
                return;
            }
            const permissions: Discord.Permissions = channel.permissionsFor(message.author);
            if (!permissions || !permissions.has("READ_MESSAGES")) {
                await this.reply(message, `You are not currently in ${channel}`);
                return;
            }
            await channel.overwritePermissions(message.author, { READ_MESSAGES: false });
            await this.reply(message, `You have left ${channel}`, true);
        } catch (error) {
            console.error(`Error occurred while removing ${message.author} from ${channel}: ${error}`);
            await this.reply(message, "An unknown error has occurred");
        }
    }

    /**
     * Replies to a message. This will try to DM the user, or reply in the channel of the original message if they have DMs disabled.
     *
     * @param message The message to reply to
     * @param content The message to send to the author
     * @param dmOnly (Optional) If set to 'true' and the user has DMs disabled, the bot will not respond to their message. Defaults to 'false'.
     */
    private async reply(message: Discord.Message, content: string, dmOnly?: boolean) {
        try {
            await message.author.send(content);
            try {
                // Delete the message if it wasn't a DM
                if (message.channel.type === "text") {
                    await message.delete();
                }
            } catch (error) {
                console.error(`Error deleting message ${message.id}`);
            }
        } catch (error) {
            if (!dmOnly) {
                try {
                    await message.reply(content);
                } catch (error) {
                    console.warn(`Error replying to message from ${message.author}: ${error}`);
                }
            }
        }
    }
}
