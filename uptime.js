const FileSystem = require("fs");

class Uptime
{
    constructor(a_Bot, a_SettingsFile, a_DataFile)
    {
        console.log("Requested uptime extension..");

        const t_Data = FileSystem.readFileSync(a_SettingsFile, "utf8");
        this.m_Settings = JSON.parse(t_Data);
        console.log("Successfully loaded uptime settings file.");

		t_Data = FileSystem.readFileSync(a_DataFile, "utf8");
        this.m_Data = JSON.parse(t_Data);
        this.m_DataFile = a_DataFile;
        console.log("Successfully loaded uptime data file.");

        this.m_Bot = a_Bot;
        this.m_Bot.on("ready", this.OnBot.bind(this));
        this.m_Bot.on("message", this.OnMessage.bind(this));
        setInterval(this.OnUpdate.bind(this), this.m_Settings.CheckInterval);
    }

    SaveData()
    {
        FileSystem.writeFileSync(this.m_DataFile, JSON.stringify(this.m_Data));
    }

    OnBot()
    {
        console.log("Uptime extension loaded.");
    }

    OnMessage(a_Message)
    {
        if(a_Message.content.startsWith("!uptime") === false)
            return;
        
        a_Message.reply("the bot has been up for " + this.UptimePercentage + "% of the time. Bot started " + this.Uptime + " ago.");
    }

    OnUpdate()
    {
        let t_TimeDifference = (new Date()).getTime() - this.m_Data.LastUptime;

        // To restart, basically set either of these values to 0
        if (this.m_Data.LastUptime == 0 || this.m_Data.UptimeStart == 0)
        {
            this.m_Data.UptimeStart = (new Date()).getTime();
            this.m_Data.TotalDowntime = 0;
            t_TimeDifference = 0;
        }

        if(t_TimeDifference > this.m_Settings.CheckInterval + 1000) // Give it some error
        {
            this.m_Data.TotalDowntime += t_TimeDifference;
            console.log("Noticed a downtime of " + (t_TimeDifference * 0.001) + " seconds.");
        }

        this.m_Data.LastUptime = (new Date()).getTime();
        this.SaveData();
    }

    get UptimePercentage() 
    {
        let t_Timespan = (new Date()).getTime() - this.m_Data.UptimeStart;
        let t_UptimePercentage = 1.0 - (this.m_Data.TotalDowntime / t_Timespan);
        // return Math.round(t_UptimePercentage * 100.0 * 10000.0) * 0.00001;
        return +(t_UptimePercentage * 100.0).toFixed(3);
    }

    AddS(a_Number)
    {
        return a_Number === 1 ? "" : "s";
    }

    get Uptime() 
    {
        let t_Message = "";
        /* How long each unit of time is, listed in ascending order. For each sub-array, first element is the name of the singular unit of time,
        and the second elements is how many units of the previous time time (milliseconds for the first entry) are in it. */
        const t_TimeUnits = [
            ["second", 1000],
            ["minute", 60],
            ["hour", 60],
            ["day", 24],
            ["week", 7],
            ["year", 52]
        ];

        let t_Millis = Date.now() - this.m_Data.UptimeStart;
        let t_MillisInUnit = 1;
        // Determine how many milliseconds are in the largest unit of time
        for (let i = 0; i < t_TimeUnits.length; i++)
        {
            t_MillisInUnit *= t_TimeUnits[i][1];
        }

        for (let i = t_TimeUnits.length - 1; i >= 0; i--)
        {
            let t_TimeUnit = t_TimeUnits[i];
            /** How many of the unit are in the time */
            let t_Interval = Math.floor(t_Millis / t_MillisInUnit);
            if (t_Interval >= 1)
            {
                if (t_Message)
                {
                    t_Message += ", "
                    if (i === 0) t_Message += "and "
                };
                t_Message += `${t_Interval} ${t_TimeUnit[0]}${t_Interval === 1 ? "" : "s"}`
                t_Millis -= t_Interval * t_MillisInUnit;
            }
            t_MillisInUnit /= t_TimeUnit[1];
        }
        return t_Message;
    }
}

exports.Uptime = Uptime;
