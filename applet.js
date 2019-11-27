const Applet = imports.ui.applet;
const Soup = imports.gi.Soup;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Mainloop = imports.mainloop;
const Lang = imports.lang;

const logging = true;

const _httpSession = new Soup.SessionAsync();
Soup.Session.prototype.add_feature.call(_httpSession, new Soup.ProxyResolverDefault());

const bingHost = 'https://www.bing.com';
const bingRequestPath = '/HPImageArchive.aspx?format=js&idx=0&n=1&mbl=1&mkt=';

function log(message) {
    if (logging) global.log(message);
}

function BingWallpaperApplet(orientation, panel_height, instance_id) {
    this._init(orientation, panel_height, instance_id);
}

BingWallpaperApplet.prototype = {
    __proto__: Applet.IconApplet.prototype,

    _init: function(orientation, panel_height, instance_id) {

        // Generic Setup
        Applet.IconApplet.prototype._init.call(this, orientation, panel_height, instance_id);
        this.set_applet_icon_name("wallpaper");
        this.set_applet_tooltip(_("Bing Desktop Wallpaper"));

        // Find file path to write
        const userPicturesDir = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES);
        this.wallpaperPath = `${userPicturesDir}/BingWallpaper.jpg`;

        // Begin refresh loop
        this._refresh();
    },

    _refresh: function() {
        let now = GLib.DateTime.new_now_local();
        let today = GLib.DateTime.new_local(now.get_year(), now.get_month(), now.get_day_of_month(), 0, 0, 0);
        let tomorrow_unix = today.to_unix() + 86400;
        let wait_time = tomorrow_unix - now.to_unix();
        wait_time = Math.max(60, wait_time); // Ensure at least 60s

        let file = Gio.file_new_for_path(this.wallpaperPath);
        let file_exists = file.query_exists(null);

        if (file_exists) {
            let file_info = file.query_info('*', Gio.FileQueryInfoFlags.NONE, null);
            let file_size = file_info.get_size();
            let file_mod_secs = file_info.get_modification_time().tv_sec;

            if ((file_mod_secs < today.to_unix()) || !file_size) { // Is the image old, or empty?
                log("Calling loadImageData");
                this._loadImageData();
            }
        } else {
            this._loadImageData()
        }
        this._removeTimeout();
        this._timeout = Mainloop.timeout_add_seconds(wait_time, Lang.bind(this, this._refresh));
    },

    _removeTimeout: function () {
        if (this._timeout) {
            Mainloop.source_remove(this._timeout);
            this._timeout = null;
        }
    },

    _resetTimeout: function() {
        /** Cancel current timeout in event of an error and try again shortly */
        this._removeTimeout();
        this._timeout = Mainloop.timeout_add_seconds(60, Lang.bind(this, this._refresh));
    },

    destroy: function () {
        this._removeTimeout();
    },

    _loadImageData: function() {
        // Get json data
        let request = Soup.Message.new('GET', `${bingHost}${bingRequestPath}`);
        _httpSession.queue_message(request, (_httpSession, message) => {
            if (message.status_code === 200) {
                const json = JSON.parse(message.response_body.data);
                this.imageData = json.images[0];
                this.set_applet_tooltip(this.imageData.copyright);
                log(`Got image url: ${this.imageData.url}`);
                this._downloadImage();
            } else {
                log(`Failed to acquire image url`);
                this._resetTimeout()  // Try again
            }
        });
    },

    _downloadImage: function() {

        const url = `${bingHost}${this.imageData.url}`;
        let gFile = Gio.file_new_for_path(this.wallpaperPath);

        // open the file
        let fStream = gFile.replace(null, false, Gio.FileCreateFlags.NONE, null);

        // create an http message
        let request = Soup.Message.new('GET', url);

        // got_chunk event
        request.connect('got_chunk', function(message, chunk) {
            if (message.status_code === 200) { // only save the data we want, not content of 301 redirect page
                fStream.write(chunk.get_data(), null);
            }
        });

        // queue the http request
        _httpSession.queue_message(request, (httpSession, message) => {
            // request completed
            fStream.close(null);
            if (message.status_code === 200) {
                log('Download successful');
                this._setBackground();
            } else {
                log("Couldn't fetch image from " + url);
                this._resetTimeout()  // Try again
            }
        });
    },

    _setBackground: function() {
        let gSetting = new Gio.Settings({schema: 'org.cinnamon.desktop.background'});
        const uri = 'file://' + this.wallpaperPath;
        gSetting.set_string('picture-uri', uri);
        gSetting.set_string('picture-options', 'zoom');
        Gio.Settings.sync();
        gSetting.apply();
    }
};


function main(metadata, orientation, panelHeight, instanceId) {
    let bingApplet = new BingWallpaperApplet(orientation, panelHeight, instanceId);
    return bingApplet;
}
