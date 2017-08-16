import Discord = require("discord.js");
import { fileBackedObject } from "./util";
import request = require("request");

// TODO: Get this thing its own nice file
declare global {
	interface Array<T> {
		remove(value: any): void;
	}
}

Array.prototype.remove = function() {
	let what, a = arguments, L = a.length, ax;
	while (L && this.length) {
		what = a[--L];
		while ((ax = this.indexOf(what)) !== -1) {
			this.splice(ax, 1);
		}
	}
	return this;
};

export interface KeyFinderSettings {
	Server: string;
	ReportChannel: string;
}

export default class KeyFinder {
	private m_Settings: KeyFinderSettings;
	private m_Keys: string[];
	private m_Bot: Discord.Client;
	private m_Channel?: Discord.TextChannel = undefined;

	constructor(a_Bot: Discord.Client, a_SettingsFile: string, a_KeyFile: string) {
		console.log("Requested KeyFinder extension..");

		this.m_Settings = fileBackedObject(a_SettingsFile);
		console.log("Successfully loaded KeyFinder settings file.");

		this.m_Keys = fileBackedObject(a_KeyFile);
		console.log("Successfully loaded KeyFinder key file.");

		this.m_Bot = a_Bot;

		this.m_Bot.on("ready", () => {
			const t_Guild = this.m_Bot.guilds.find("name", this.m_Settings.Server);
			if (t_Guild) {
				const t_Channel = t_Guild.channels.find("name", this.m_Settings.ReportChannel) as Discord.TextChannel;
				if (t_Channel) {
					this.m_Channel = t_Channel;
				} else {
					console.error("Incorrect setting for the channel: " + this.m_Settings.ReportChannel);
				}
			} else {
				console.error("Incorrect setting for the server: " + this.m_Settings.Server);
			}

			console.log("KeyFinder extension loaded.");
			this.TestAllKeys();
		});
		this.m_Bot.on("message", this.OnMessage.bind(this));
	}

	OnMessage(a_Message: Discord.Message) {
		if (a_Message.author.id === this.m_Bot.user.id)
			return;

		this.FindKey(a_Message.author.username, a_Message.content, "#" + (a_Message.channel as Discord.TextChannel).name);

		// If we have a reporting channel, we're posting in that reporting channel, and it's either activekeys or active_keys
		let t_AskingForActiveKeys = a_Message.content.startsWith("!active_keys") || a_Message.content.startsWith("!activekeys");
		if (!this.m_Channel)
			return;

		let t_InReporterChannel = a_Message.channel.id === this.m_Channel.id;
		if (t_AskingForActiveKeys && t_InReporterChannel) {
			if (this.m_Keys.length === 0) {
				a_Message.reply("I haven't found any keys.");
				return;
			}

			let t_Message = `I've found ${this.m_Keys.length} key${this.m_Keys.length === 1 ? "" : "s"} that ${this.m_Keys.length === 1 ? "is" : "are"} still active:\n`;
			for (let i = 0; i < this.m_Keys.length; i++)
				t_Message += ` - ${this.m_Keys[i]}\n`;

			a_Message.reply(t_Message);
		}
	}
	/**
	 * Checks if an API key is valid
	 * @param a_Key The API key to test
	 * @async
	 * @returns 'true' if the key yields a non-403 response code, 'false' if the key yields a 403 response code
	 * @throws {Error} Thrown if the API call cannot be completed or results in a status code other than 200 or 403
	 */
	TestKey(a_Key: string): Promise<boolean> {
		return new Promise((resolve, reject) => {
			const t_Options = {
				followAllRedirects: true,
				url: "https://euw1.api.riotgames.com/lol/summoner/v3/summoners/22929336",
				headers: {
					"X-Riot-Token": a_Key,
				}
			};

			request(t_Options, (error, response) => {
				if (error) {
					reject("Error while testing key: " + error);
				} else {
					if (response.statusCode === 403) {
						resolve(false);
					} else {
						resolve(true);
					}
				}
			});
		});
	}

	TestAllKeys() {
		for (let i = 0; i < this.m_Keys.length; i++) {
			let t_Key = this.m_Keys[i];
			// TODO make sure this doesn't cause concurrent modification problems with m_Keys
			this.TestKey(this.m_Keys[i]).then((a_Works: boolean) => {
				if (a_Works) return;
				this.m_Keys.remove(t_Key);

				let t_Message = `Key \`${t_Key}\ returns 403 Forbidden now, removing it from my database.`;

				console.warn(t_Message);
				if (this.m_Channel)
					this.m_Channel.send(t_Message);
			});
		}

		setTimeout(this.TestAllKeys.bind(this), 10000);
	}

	/**
	 * Checks if a message contains a working API key
	 * @param a_User The user who sent the message (used when reporting found keys)
	 * @param a_Message The message to check for an API key
	 * @param a_Location Where the message was sent (used when reporting found keys)
	 * @async
	 * @returns 'true' if a working API key was found in the message, 'false' if one wasn't
	 */
	async FindKey(a_User: string, a_Message: string, a_Location: string): Promise<boolean> {
		const t_Matches = a_Message.match(/RGAPI\-[a-fA-F0-9]{8}\-[a-fA-F0-9]{4}\-[a-fA-F0-9]{4}\-[a-fA-F0-9]{4}\-[a-fA-F0-9]{12}/i);

		if (t_Matches === null)
			return false;
		// TODO check all matches
		const t_Key = t_Matches[0];

		const t_Works = await this.TestKey(t_Key);
		if (t_Works) {
			const t_Message = `Found a working key at ${a_Location} posted by ${a_User}: \`${t_Key}\``;

			console.warn(t_Message);
			if (this.m_Channel)
				this.m_Channel.send(t_Message);

			// TODO: do this instead: this.m_Keys.push({ key: t_Key, location: a_Location, user: a_User });
			// TODO: Check for duplicates.
			this.m_Keys.push(t_Key);
			return true;
		} else {
			const t_Message = `Found an inactive key at ${a_Location} posted by ${a_User}: \`${t_Key}\``;

			console.warn(t_Message);
			if (this.m_Channel)
				this.m_Channel.send(t_Message);
			// true is only returned for working API keys
			return false;
		}
	}
}
