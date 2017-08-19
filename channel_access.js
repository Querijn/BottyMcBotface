"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const util_1 = require("./util");
class ChannelAccess {
    constructor(bot, settingsFile) {
        console.log("Requested ChannelAccess extension..");
        this.settings = util_1.fileBackedObject(settingsFile);
        console.log("Successfully loaded ChannelAccess settings file.");
        this.bot = bot;
        this.bot.on("ready", () => this.onBotReady());
    }
    onBotReady() {
        let guild = this.bot.guilds.get(this.settings.ServerID);
        if (!guild) {
            console.error(`Invalid settings for guild ID ${this.settings.ServerID}`);
            return;
        }
        this.guild = guild;
        this.bot.on("message", message => this.processMessage(message));
    }
    processMessage(message) {
        if (message.author.id === this.bot.user.id)
            return;
        /** The message contents, split at spaces */
        const split = message.cleanContent.split(" ");
        let action;
        if (split[0].match(/^(!|\/)join$/gi))
            action = "join";
        if (split[0].match(/^(!|\/)leave$/gi))
            action = "leave";
        if (!action)
            return;
        /** The specified name of the channel the user is trying to join/leave */
        let channelName;
        /** The channel the user is trying to join/leave */
        let channel;
        // "!leave" (with no argument) will leave the channel the user sent the message in
        if (split.length === 1) {
            if (action === "join") {
                this.reply(message, "You must specify a channel to join");
                return;
            }
            if (message.channel.type !== "text") {
                this.reply(message, "You must specify a channel to leave when using this command in DMs");
                return;
            }
            channel = message.channel;
        }
        else {
            channelName = split[1];
            // Remove "#" if the user prefixed the channel name with one
            if (channelName.startsWith("#")) {
                channelName = channelName.slice(1);
            }
            channel = this.guild.channels.find("name", channelName);
        }
        if (!channel) {
            // TODO list available channels?
            this.reply(message, `Channel "${channelName}" does not exist`);
            return;
        }
        if (channel.type !== "text") {
            this.reply(message, "You may only join/leave text channels");
            return;
        }
        if (action === "join") {
            this.joinChannel(message, channel);
        }
        else if (action === "leave") {
            this.leaveChannel(message, channel);
        }
    }
    /**
     * Tries to add a user to a channel, informing them of any problems that occur.
     * @param message The message the user sent to initiate the action. This is used to determine who will be added to the channel, and to reply to the user if any issues occur.
     * @param channel The channel to add the user to. This channel is a valid text channel on the correct server.
     */
    joinChannel(message, channel) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (this.settings.RestrictedChannels.indexOf(channel.id) !== -1) {
                    yield this.reply(message, `You are not allowed to join ${channel}`);
                    return;
                }
                const permissions = channel.permissionsFor(message.author);
                if (permissions && permissions.has("READ_MESSAGES")) {
                    yield this.reply(message, `You are already in ${channel}`);
                    return;
                }
                yield channel.overwritePermissions(message.author, { READ_MESSAGES: true });
                yield this.reply(message, `You have joined ${channel}`, true);
            }
            catch (error) {
                console.error(`Error occured while adding ${message.author} to ${channel}: ${error}`);
                yield this.reply(message, "An unknown error occurred");
            }
        });
    }
    /**
     * Tries to remove a user from a channel, informing them of any problems that occur.
     * @param message The message the user sent to initiate the action. This is used to determine who will be removed from the channel, and to reply to the user if any issues occur.
     * @param channel The channel remove the user from. This channel is a valid text channel on the correct server.
     */
    leaveChannel(message, channel) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                if (this.settings.ForcedChannels.indexOf(channel.id) !== -1) {
                    yield this.reply(message, `You may not leave ${channel}`);
                    return;
                }
                const permissions = channel.permissionsFor(message.author);
                if (!permissions || !permissions.has("READ_MESSAGES")) {
                    yield this.reply(message, `You are not currently in ${channel}`);
                    return;
                }
                yield channel.overwritePermissions(message.author, { READ_MESSAGES: false });
                yield this.reply(message, `You have left ${channel}`, true);
            }
            catch (error) {
                console.error(`Error occurred while removing ${message.author} from ${channel}: ${error}`);
                yield this.reply(message, "An unknown error has occurred");
            }
        });
    }
    /**
     * Replies to a message. This will try to DM the user, or reply in the channel of the original message if they have DMs disabled.
     * @param message The message to reply to
     * @param content The message to send to the author
     * @param dmOnly (Optional) If set to 'true' and the user has DMs disabled, the bot will not respond to their message. Defaults to 'false'.
     */
    reply(message, content, dmOnly) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield message.author.send(content);
                try {
                    // Delete the message if it wasn't a DM
                    if (message.channel.type === "text") {
                        yield message.delete();
                    }
                }
                catch (error) {
                    console.error(`Error deleting message ${message.id}`);
                }
            }
            catch (error) {
                if (!dmOnly) {
                    try {
                        yield message.reply(content);
                    }
                    catch (error) {
                        console.warn(`Error replying to message from ${message.author}: ${error}`);
                    }
                }
            }
        });
    }
}
exports.ChannelAccess = ChannelAccess;
