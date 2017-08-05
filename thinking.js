const FileSystem = require("fs");

class Thinking
{
    constructor(a_Bot, a_UserFile)
    {
        console.log("Requested Thinking extension..");
        this.m_Bot = a_Bot;

        const t_Data = FileSystem.readFileSync(a_UserFile, "utf8");
        this.m_ThinkingUsers = JSON.parse(t_Data);
        this.m_UserFile = a_UserFile;
        console.log("Successfully loaded original thinking user file.");

        this.m_Bot.on("ready", this.OnBot.bind(this));

        this.m_Bot.on("message", this.OnMessage.bind(this));
    }

    SaveOriginalThinkingUsers()
    {
        FileSystem.writeFileSync(this.m_UserFile, JSON.stringify(this.m_ThinkingUsers));
    }

    OnBot()
    {
        console.log("Thinking extension loaded.");
        this.m_Date = Date.now();
    }

    OnMessage(a_Message)
    {
        if (a_Message.content.startsWith("!original_thinko_reacts_only") && this.m_ThinkingUsers.indexOf(a_Message.author.id) === -1)
        {
            this.m_ThinkingUsers.push(a_Message.author.id);
            this.SaveOriginalThinkingUsers();

            a_Message.reply("I will now discriminate for you. !no_more_original_thinkos to stop.");
            return;
        }
        else if (a_Message.content.startsWith("!no_more_original_thinkos") && this.m_ThinkingUsers.indexOf(a_Message.author.id) !== -1)
        {
            const t_Index = this.m_ThinkingUsers.indexOf(a_Message.author.id);
            this.m_ThinkingUsers.splice(t_Index, 1);
            this.SaveOriginalThinkingUsers();

            a_Message.channel.send("REEEEEEEEEEEEEEEEE");
            return;
        }

        if (a_Message.content.includes("🤔") === false)
            return;
        
        if (this.m_ThinkingUsers.indexOf(a_Message.author.id) !== -1)
        {
            a_Message.react("🤔");
            return;
        }

        let t_Emoji = null;
        while (true)
        {
            t_Emoji = a_Message.guild.emojis.random();
            if (t_Emoji.name.includes("thinking"))
                break;
        }
        
        a_Message.react(t_Emoji.identifier);
    }
}

exports.Thinking = Thinking;
