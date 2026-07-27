# DiscouRSS - RSS to Discord Bridge

DiscouRSS is a Google Sheets Addon that reads RSS Feeds (such as news, Letterboxd reviews, GoodReads activity) and pipe those events to a Discord channel.

<p align="center">
  <a href="https://youtu.be/oeZnfSZpV84">
    <img src="/img/discourss-video.png" alt="Video showing a DiscouRSS demonstration." />
  </a>
</p>

The configuration and execution is handled entirely within Google Sheets, allowing for easy management with no cost (beyond a Google account).

## Features

 - Implemented via Discord Webhooks, so no read access to Discord messaages.
 - Runs hourly (more frequent if manually triggered).
 - Uses Google Access Control for managing activity.
 - Adaptive rate limiting for Discord webhooks, up to about 60 Discord messages per channel per run.
 - Converts RSS HTML to Discord Markdown.
 - Plenty of customization options.

## Setup

NOTE: This is currently in private beta.

 - [Create a webhook in Discord](https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks).
 - [Enable the Addon](https://workspace.google.com/u/0/marketplace/app/discourss/107272671119) in the Workplace Marketplace Store.
 - Open a spreadsheet ([blank is recommended](https://sheets.new), but not necessary).
 - Locate the `DisouRSS` menu under the `Extensions` menu and select `Show sidebar`.
 - Enter the webhook. Submitting this will setup the Spreadsheet.
 - Enter an RSS URL under the Feeds column and a Discord User ID or other attributation under the Discord column.
 - Cick `Run` in the `DiscouRSS` sidebar to manualy test the settings.
 - To run DiscouRSS automatically, click the `Enable Timer` sidebar button.

## Configuration

### Feed Tab

| Name | Type | Description |
| ---- | ---- | ----------- |
| **Feed** | String | URL of the RSS Feed |
| **Discord** | String | User ID or Name to attribute to the update. |
| **Time** | String | *(Internal)* Unix time of last update. Set to `0` to force a rescan. |
| **GUID** | String | *(Internal)* Latest feed item. Set to 0 to push all feed items. |
| **Status** | String | *(Informative)* Last run status for the given feed. |

### Sidebar Settings

| Name | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| **webhook** | String | `` | Discord channel webhook. |
| **appname** | String | `` | The Discord Bot name. If not set, will either be set to a feed-specific default or `DiscouRSS` if nothing else. |
| **avatar_url** | String | `` | URL to an image used for the Discord Bot. Leave blank and the bot will try to determine the proper icon to be used. |
| **signature** | String |`%s Posted:` | The signature used for the title. "%s" is replaced with the value in the Discord column. |
| **feed_pattern** | String | `https://` | Regular expression that individual feeds are validated against. |
| **feed_limit** | Integer | `5` | How many RSS feeds to process per run. |
| **feed_frequency** | Integer | 3600 | How long a single feed will be scanned (in seconds). |
| **image_format** | String | `image` | How to attach the image from the feed item (image|thumbnail|none) |
| **bundle** | Boolean | `FALSE` | Whether or not to bundle the items as a single discord message. |
