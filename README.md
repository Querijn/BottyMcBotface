# BottyMcBotface

The Riot Games API Discord Bot. This is the bot that helps out with your questions regarding the Riot Games API. 

## Available commands

- **!esports**: Prints out a list of esports games.
- **!help**: Prints all the commands
- **!lib, !libs, !libraries**: Print a list of the public libraries
- **!note, !notes**: Prints all the notes, or the content of a note if used with a parameter
- **!pickem**: Prints out information about your pickems.
- **!status, !apistatus**: Prints the status of the Riot Games API
- **!toggle_default_thinking**: Changes bottys reaction from the normal thinking emote, to one of the custom ones (or opposite)
- **!toggle_react**: Decides if botty reacts to your messages
- **!update_schema, !updateschema**: Loads an updated api url schema
- **!welcome**: Prints out a copy of the welcome message.

##### Admin-only commands

- **!active_keys, !activekeys**: Prints a list of keys that botty have seen, and that are still active
- **!refresh_thinking**: Reloads the thinking emojis
- **!restart, !reboot**: Restarts Botty.
- **!toggle_command**: Enables or disables commands (!toggle_command {command})

## Modules currently in use

- **CommandController**: As the name indicates, this controls the commands and makes sure other API commands have a working listener that can be toggled on or off during runtime by administrators.
- **APISchema**: Controls the Riot API schema that is used by the API url extension and other modules.
- **JoinMessaging**: Sends a message on join to new users so that they can get started right away.
- **Logger**: A simple module that hooks console.log, warning and error so that we get any errors the bot outputs without having to check out the terminal it is running on.
- **KeyFinder**: Scans messages for keys, and then keeps track of them. 
- **Techblog**: Updates #external-activity with posts on the Tech Blog.
- **ApiUrlInterpreter**: Scans for API Urls and tries identifying issues. Otherwise, posts what the result of that API call would be.
- **VersionChecker**: Checks out if League of Legends or DDragon has updated to a new version. If so, posts in #external-activity.
- **Info**: Saves all kinds of notes and outputs them on request. This is the !note command.
- **AutoReact**: A small module that reacts to specific messages made by users.
- **ApiStatus**: Keeps track of the API status.
- **RiotAPILibraries**: Can output the Riot API Libraries from the article on the forum via GitHub.
- **Esports**: Handles the data collection and output for !esports 
- **Pickem**: Handles the data collection and output for !pickem

## Setting up

1. First, clone the repository by clicking the green "Clone or download" button, or alternatively, use `git clone git@github.com:Querijn/BottyMcBotface.git`.
2. I recommend using VS Code, as it has excellent Typescript support. It works fine without. I will explain both how to run this in a regular terminal and VS Code. 
3. Open the root folder in the terminal. This is the folder that contains the `src`, `private`, `settings` and `data` folder. You can open VS Code in this folder by typing `code .` (Or alternatively, `code <path/to/code>` from anywhere)
4. Type `npm install` in the terminal. This will install all the packages that this application uses.
5. While that is running, you can go over to the private folder and open up `shared_settings.json`. This is the settings json that contains all the information that is specific to your running bot. You can put any JSON in here that is also in `settings/shared_settings.json`, because the private version will override settings over the global one. Do not commit your `private/shared_settings.json`.
6. The `server` is the Discord Guild/Server that your bot needs to focus on. It will work outside of this context, but it will try to find specific channels for use in here. This requires you to either setup a Discord server that looks like the official one, or to join [our own recreation](https://discord.gg/zTJYKkA) (requires some potential elevated actions): . The id for this server is `342988445498474498`. You can get an ID by enabling Developer mode in Discord (`User settings > Appearance > Advanced > Developer Mode`) and then rightclick on whatever server you need the ID of.
7. `botty.discord.key` needs to be your Discord Bot key. Go to [Discord's My Apps](https://discordapp.com/developers/applications/me) and [create a bot](https://discordapp.com/developers/applications/me/create). if you've already created one, skip to step 10.
8. Give it a name and a nice icon. Click create. 
9. On the following page, click `Create a Bot User`. Confirm the following popup.
10. On this page, click `Reveal Token` under `Bot`. This will give you your key! It will look something like `NDY1MDcwNTg5NDkzOTAzMzYw.DiIKfg.6tZKdh7rgYQWNZIqsjaogVb56v8`. Put it in the shared_settings.json variable for the discord key. You're already setup to connect, but there are some changes required to make sure you can run the bot correctly. The forum and GitHub settings you can leave the same. 
11. If you're making changes to the `RiotAPILibraries` module, you'll need to change them to your GitHub API password and your username. If you have forum administrator access, you can change your user to the format seen in the settings. Enter the forum password below that. 
12. Then go to the app.ts. This is the entry point for the bot, and also contains every single module used. For simplicity, you can turn off everything but the module you're working on and the `CommandController`. Every command for the modules you've shut down need to be shutdown as well. Note: the Info module is for the `!note` commands. It was renamed to note because of a conflict with another bot existing previously.
13. Run the application with `npm run start` or `tslint -p . && tsc -p . && node ./dist/app.js`. The first command does not lint, and the second one does. Checking lint errors is required before committing code, but not required for building.
