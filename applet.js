const Applet = imports.ui.applet;
const Soup = imports.gi.Soup;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;

const _httpSession = new Soup.SessionAsync();
Soup.Session.prototype.add_feature.call(_httpSession, new Soup.ProxyResolverDefault());

const bingHost = 'https://www.bing.com';
const bingRequestPath = '/HPImageArchive.aspx?format=js&idx=0&n=1&mbl=1&mkt=';

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

        // Get json data

        let request = Soup.Message.new('GET', `${bingHost}${bingRequestPath}`);
        _httpSession.queue_message(request, (_httpSession, message) => {
            const json = JSON.parse(message.response_body.data);
            this.imageData = json.images[0];
            global.log(`Got image url:${this.imageData.url}`);
            this._download_image();
        });

    },

    _download_image: function() {

        const url = `${bingHost}${this.imageData.url}`;

        const userPicturesDir = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES);

        let gFile = Gio.file_new_for_path(userPicturesDir + '/BingWallpaper.jpg');

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
        _httpSession.queue_message(request, function(httpSession, message) {
            // request completed
            fStream.close(null);
            if (message.status_code === 200) {
                global.log('Download successful');
                //this._setBackground();
            } else {
                global.log("Couldn't fetch image from " + url);
                //gFile.delete(null);
            }
        });
    }

};



function main(metadata, orientation, panelHeight, instanceId) {
    let bingApplet = new BingWallpaperApplet(orientation, panelHeight, instanceId);
    return bingApplet;
}
