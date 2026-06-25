# DiscouRSS - RSS to Discord Bridge

DiscouRSS is a Google Sheets Addon that reads RSS Feeds (such as news, Letterboxd reviews, GoodReads activity) and pipe those events to a Discord channel.

The configuration and execution is handled entirely within Google Sheets, allowing for easy management with no cost (beyond a Google account).

## Setup

NOTE: This is currently in private beta.

 - [Create a webhook in Discord](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks).
 - [Enable the Addon](https://workspace.google.com/u/0/marketplace/app/discourss/107272671119) in the Workplace Marketplace Store.
 - Open a spreadsheet ([blank is recommended](https://sheets.new), but not necessary).
 - Locate the `DisouRSS` menu under the `Extensions` menu.
 - Start with `Setup` as that will create the necessary sheets and columns.
 - Enter your RSS feed details in the `Feeds` tab.
 - Enter the Discord Webhook under the `Settings` tab in the `webhook` field.
 - Cick `Run` in the `DiscouRSS` menu to manualy test the settings.
 - To run DiscouRSS automatically, click the `Enable` menu item.

## Configuration

### Feed Tab

**Feed** | String | URL of the RSS Feed
**Discord** | String | User ID or Name to attribute to the update.
**Time** | String | *(Internal)* Unix time of last update. Set to `0` to force a rescan.
**GUID** | String | *(Internal)* Latest feed item. Set to 0 to push all feed items.
**Status** | String | *(Informative)* Last run status for the given feed.

### Settings Tab

| Name | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| **webhook** | String | `` | Discord channel webhook. |
| **appname** | String | `DiscouRSS` | The Discord Bot name. |
| **avatar_url** | String | `` | URL to an image used for the Discord Bot. Leave blank and the bot will try to determine the proper icon to be used. |
| **signature** | String |`%s Posted:` | The signature used for the title. "%s" is replaced with the discord user. |
| **feed_pattern** | String | `https://` | Regular expression that individual feeds are validated against. |
| **feed_limit** | Integer | `5` | How many feeds to process per run. |
| **feed_frequency** | Integer | 3600 | How long a single feed will be scanned (in seconds). |
| **image_format** | String | `image` | How to attach the image from the feed item (image|thumbnail|none) |
| **bundle** | Boolean | `FALSE` | Whether or not to bundle the items as a single discord message. |

### Debugging

Detailed execution details can be found in the `Logs` tab.

By default, the feeds are scanned every five minutes, with each feed scanned once an hour. To override this behavior and force a feed to be rescanned, set the `Time` column to `0`.

Feed items will only be sent to Discord if they are "new," as determined by the `GUID` column. Setting the cell to an empty value will cause the feed to revert to its initial state with the latest feed item used to determine "new" moving forward.

Setting a feed's `GUID` cell to `0` will cause all feed items to be considered new.

You can also set the `GUID` cell to a previous `guid` value (from the feed) to send all subsequent feed items. There is no way to send a specific feed item currently.

## Contributing

Pull requests and new issues are welcome.

AI was used for the generation of mock and test code. All the fun code was human-generated.

### Deployment Instructions

There are a total of six version systems to be aware of (not counting github stuff):

 - AppsScript HEAD: untracked, AppsScript versions are snapshots of this.
 - AppsScript Version: incremental snapshot counter.
 - AppsScript Deployments: (currently unused) a deployment target for AppsScript Versions. Used primarily for static web app URLs.
 - NPM Version: should map 1-1 with AppsScript Version, marked through git tags.
 - `version.js`: deployed code versioning that changes on every build. May differ from AppsScript Version due to AppsScript HEAD deploys, but there will always be exactcly one `version.js` that ties MPM Version to AppsScript Version.
 - Workplace Marketplace: TBD. Appars to be based on AppsScript Versions, not AppsScript Deployments.

`npm run build` will increment `version.js` only. Combine it with `npm run push` to push the current code to AppsScript `HEAD`.

`npm version patch` (and related) commands will create an NPM version (via git tags) and also create a persistent AppsScript Version. The AppsScript Version will have the NPM Version and `version.js` embedded in its description. You can run `npx clasp versions` to inspect the versions.

TODO: document deployment to the marketplace.
