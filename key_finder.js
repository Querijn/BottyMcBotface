var Answerhub = require("./answerhub.js");
const FileSystem = require('fs');
const Discord = require('discord.js');
var request = require('request');

// TODO: Get this thing its own nice file
Array.prototype.remove = function() {
    var what, a = arguments, L = a.length, ax;
    while (L && this.length) {
        what = a[--L];
        while ((ax = this.indexOf(what)) !== -1) {
            this.splice(ax, 1);
        }
    }
    return this;
};

class KeyFinder
{
    constructor(a_Bot, a_SettingsFile, a_KeyFile)
    {
        console.log("Requested KeyFinder extension..");

        var t_Data = FileSystem.readFileSync(a_SettingsFile, 'utf8');
        this.m_Settings = JSON.parse(t_Data);
        this.m_SettingsFile = a_SettingsFile;
        console.log("Successfully loaded KeyFinder settings file.");

        t_Data = FileSystem.readFileSync(a_KeyFile, 'utf8');
        this.m_Keys = JSON.parse(t_Data);
        this.m_KeyFile = a_KeyFile;
        console.log("Successfully loaded KeyFinder key file.");

        this.m_Bot = a_Bot;

        this.m_Bot.on('ready', this.OnBot.bind(this));
        this.m_Bot.on('message', this.OnMessage.bind(this));
    }

    OnBot()
    {
        console.log("KeyFinder extension loaded.");

        this.TestAllKeys();
    }

    OnMessage(a_Message)
    {
        if (a_Message.author.id == this.m_Bot.user.id)
            return;
        
        // If we have a reporting channel, we're posting in that reporting channel, and it's either activekeys or active_keys
        let t_AskingForActiveKeys = (a_Message.content.startsWith("!active_keys") || a_Message.content.startsWith("!activekeys"));
        let t_ReporterChannelExists = !(!this.Channel);
        let t_InReporterChannel = a_Message.channel.id == this.Channel.id;
        if (t_AskingForActiveKeys && t_ReporterChannelExists && t_InReporterChannel)
        {
            if (this.m_Keys.length == 0) 
            {
                a_Message.reply("I haven't found any keys.");
                return;
            }

            let t_Message = "I've found " + this.m_Keys.length + " key" + (this.m_Keys.length == 1 ? "" : "s") + " that " + (this.m_Keys.length == 1 ? "is" : "are") + " still active:\n";
            for (let i = 0; i < this.m_Keys.length; i++)
                t_Message += " - " + this.m_Keys[i] + "\n";

            a_Message.reply(t_Message);
        }

        this.FindKey(a_Message.author.username, a_Message.content, "#" + a_Message.channel.name)
    }

    TestKey(a_Key, a_Callback)
    {
        var t_Options =
        {
            followAllRedirects: true,
            url: "https://euw1.api.riotgames.com/lol/summoner/v3/summoners/22929336",
            headers: 
            {
                "X-Riot-Token": a_Key,
            }
        };

        return request(t_Options, (error, response, body) => 
        { 
            if (error) 
            {
                console.error("Error while testing a key: " + error.toString());
                return;
            }

            a_Callback(response.statusCode != 403, a_Key); 
        });
    }

    TestAllKeys()
    {
        for (let i = 0; i < this.m_Keys.length; i++)
        {
            this.TestKey(this.m_Keys[i], (a_Works, a_Key) =>
            {
                if (a_Works) return;

                this.m_Keys.remove(a_Key);
                this.SaveKeys();

                let t_Message = "Key `" + a_Key + "` returns 403 Forbidden now, removing it from my database.";
                
                console.warn(t_Message);
                let t_Channel = this.Channel;
                if (t_Channel != null)
                    t_Channel.send(t_Message);
            });
        }

        setTimeout(this.TestAllKeys.bind(this), 10000);
    }

    FindKey(a_User, a_Message, a_Location)
    {
        let t_Matches = a_Message.match(/RGAPI\-[a-fA-F0-9]{8}\-[a-fA-F0-9]{4}\-[a-fA-F0-9]{4}\-[a-fA-F0-9]{4}\-[a-fA-F0-9]{12}/i);

        // It's unlikely that old keys will show up, as only prod keys can be old keys atm, plus this code matched all UUIDs..
        // if (t_Matches == null)
        //     t_Matches = a_Message.match(/[a-fA-F0-9]{8}\-[a-fA-F0-9]{4}\-[a-fA-F0-9]{4}\-[a-fA-F0-9]{4}\-[a-fA-F0-9]{12}/i);

        if (t_Matches == null)
            return;

        var t_Key = t_Matches[0];

        this.TestKey(t_Key, (a_Works, a_Key) =>
        {
            if(a_Works)
            {
                let t_Message = "Found a working key at " + a_Location + " posted by " + a_User + ": `" + t_Key + "`";
                
                console.warn(t_Message);
                let t_Channel = this.Channel;
                if (t_Channel != null)
                    t_Channel.send(t_Message);

                // TODO: do this instead: this.m_Keys.push({ key: t_Key, location: a_Location, user: a_User });
                // TODO: Check for duplicates.
                this.m_Keys.push(t_Key);
                this.SaveKeys();
            }
            else
            {
                let t_Message = "Found an inactive key at " + a_Location + " posted by " + a_User + ": `" + t_Key + "`";
                
                console.warn(t_Message);
                let t_Channel = this.Channel;
                if (t_Channel != null)
                    t_Channel.send(t_Message);
            }
        })
    }

    SaveSettings()
    {
        FileSystem.writeFile(this.m_SettingsFile, JSON.stringify(this.m_Settings), (a_Error) => 
        {
            if (a_Error) console.error("Error occurred during saving of keyfinder settings: " + a_Error);
        });
    }

    SaveKeys()
    {
        FileSystem.writeFile(this.m_KeyFile, JSON.stringify(this.m_Keys), (a_Error) => 
        {
            if (a_Error) console.error("Error occurred during saving of keys: " + a_Error);
        });
    }

    get Channel()
    {
        var t_Guild = this.m_Bot.guilds.find("name", this.m_Settings.Server);
        if (typeof(t_Guild) === 'undefined')
        {
            console.error("Incorrect setting for the server: " + this.m_Settings.Server);
            return null;
        }

        var t_Channel = t_Guild.channels.find("name", this.m_Settings.ReportChannel);
        if (typeof(t_Channel) === 'undefined')
        {
            console.error("Incorrect setting for the channel: " + this.m_Settings.ReportChannel);
            return null;
        }

        return t_Channel;
    }
}

exports.KeyFinder = KeyFinder;