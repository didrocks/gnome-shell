// -*- mode: js; js-indent-level: 4; indent-tabs-mode: nil -*-

const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Pango = imports.gi.Pango;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const Main = imports.ui.main;
const ModalDialog = imports.ui.modalDialog;

const _DIALOG_ICON_SIZE = 48;

const VolumeOverrideDialogIface = '<node> \
<interface name="org.gnome.Shell.VolumeOverrideDialog"> \
<method name="Open"> \
</method> \
<method name="Close"> \
</method> \
</interface> \
</node>';

var VolumeOverrideDialog = new Lang.Class({
    Name: 'VolumeOverrideDialog',
    Extends: ModalDialog.ModalDialog,

    _init: function () {
        this.parent({ styleClass: 'volume-override-dialog' });

        let mainContentLayout = new St.BoxLayout({ vertical: false });
        this.contentLayout.add(mainContentLayout,
                               { x_fill: true,
                                 y_fill: false });

        this._iconBin = new St.Bin();
        this._iconBin.child = new St.Icon({
            icon_name: 'audio-volume-amplified-symbolic',
            icon_size: _DIALOG_ICON_SIZE,
            style_class: 'volume-override-dialog-icon'
        });
        mainContentLayout.add(this._iconBin,
                              { x_fill: true,
                                y_fill: false,
                                x_align: St.Align.END,
                                y_align: St.Align.START });

        let messageLayout = new St.BoxLayout({ vertical: true,
                                               style_class: 'volume-override-dialog-layout' });
        mainContentLayout.add(messageLayout,
                              { y_align: St.Align.START });

        this._subjectLabel = new St.Label(
            { style_class: 'volume-override-dialog-subject' ,
              text: _("Enable Volume Above 100%?") });

        messageLayout.add(this._subjectLabel,
                          { x_fill: false,
                            y_fill:  false,
                            x_align: St.Align.START,
                            y_align: St.Align.START });

        this._descriptionLabel = new St.Label(
            { style_class: 'volume-override-dialog-description',
              text: _("Raising the volume above 100% results in a reduction in audio quality. " +
                    "If possible, it is better to increase the volume in any applications you " +
                    "are using.") });
        this._descriptionLabel.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this._descriptionLabel.clutter_text.line_wrap = true;

        messageLayout.add(this._descriptionLabel,
                          { y_fill:  true,
                            y_align: St.Align.START });

        this.addButton({
            action: Lang.bind(this, this.close),
            label: _("Cancel"),
            key: Clutter.Escape
        });
        this.addButton({
            action: Lang.bind(this, this._openSettings),
            label: _("Volume Settings")
        });
        this.addButton({
            action: Lang.bind(this, this._enableOverride),
            label: _("Enable")
        });

    },

    destroy: function () {
        this.parent();
    },

    _enableOverride: function() {
        this.emit('override-enabled');
        this.close();
        Main.overview.hide();
    },

    _openSettings: function () {
        let desktopFile = 'gnome-sound-panel.desktop'
        let app = Shell.AppSystem.get_default().lookup_app(desktopFile);

        if (!app) {
            log('Settings panel for desktop file ' + desktopFile + ' could not be loaded!');
            return;
        }

        this.close();
        Main.overview.hide();
        app.activate();
    }
});

var VolumeOverrideDialogDBus = new Lang.Class({
    Name: 'VolumeOverrideDialogDBus',

    _init: function () {
        this._volumeOverrideDialog = null;

        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(VolumeOverrideDialogIface, this);
        this._dbusImpl.export(Gio.DBus.session, '/org/gnome/Shell/VolumeOverrideDialog');

        Gio.DBus.session.own_name('org.gnome.Shell.VolumeOverrideDialog', Gio.BusNameOwnerFlags.REPLACE, null, null);
    },

    _onDialogClosed: function () {
        this._volumeOverrideDialog = null;
    },

    _onOverrideEnabled: function () {
        this._enableOverride();
    },

    _enableOverride: function() {
        let settings = new Gio.Settings({ schema_id: 'org.gnome.desktop.sound' });
        settings.set_boolean('allow-amplified-volume', true);
    },

    OpenAsync: function (params, invocation) {
        if (this._volumeOverrideDialog) {
            invocation.return_value(null);
            return;
        }

        let dialog;
        try {
            dialog = new VolumeOverrideDialog();
        } catch (e) {
            invocation.return_value(null);
            return;
        }
        dialog._sender = invocation.get_sender();

        dialog.connect('closed', Lang.bind(this, this._onDialogClosed));
        dialog.connect('override-enabled', Lang.bind(this, this._onOverrideEnabled));
        dialog.open();

        this._volumeOverrideDialog = dialog;
        invocation.return_value(null);
    },

    Show: function() {
        if (this._volumeOverrideDialog)
            return;

        let dialog;
        try {
            dialog = new VolumeOverrideDialog();
        } catch (e) {
            return;
        }

        dialog.connect('closed', Lang.bind(this, this._onDialogClosed));
        dialog.connect('override-enabled', Lang.bind(this, this._onOverrideEnabled));
        if (!dialog.open()) {
            return;
        }

        this._volumeOverrideDialog = dialog;
    },

    CloseAsync: function (params, invocation) {
        if (this._volumeOverrideDialog &&
            this._volumeOverrideDialog._sender == invocation.get_sender())
            this._volumeOverrideDialog.close();

        invocation.return_value(null);
    }
});
