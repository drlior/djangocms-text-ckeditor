(function ($) {
// CMS.$ will be passed for $
$(document).ready(function () {

    var pluginsMap = {};

    CKEDITOR.plugins.add('cmsplugins', {

        // Register the icons. They must match command names.
        icons: 'cmsplugins',

        // The plugin initialization logic goes inside this method.
        init: function (editor) {
            var that = this;

            this.options = CMS.CKEditor.options.settings;
            this.editor = editor;

            /**
             * populated with _fresh_ child plugins
             */
            this.child_plugins = [];
            this.setupCancelCleanupCallback(this.options);

            // don't do anything if there are no plugins defined
            if(this.options === undefined || this.options.plugins === undefined) return false;

            this.setupDialog();

            // add the button
            this.editor.ui.add('cmsplugins', CKEDITOR.UI_PANELBUTTON, {
                'toolbar': 'cms,0',
                'label': this.options.lang.toolbar,
                'title': this.options.lang.toolbar,
                'className' : 'cke_panelbutton__cmsplugins',
                'modes': { wysiwyg:1 },
                'editorFocus': 0,

                'panel': {
                    'css': [CKEDITOR.skin.getPath('editor')].concat(that.editor.config.contentsCss),
                    'attributes': { role: 'cmsplugins', 'aria-label': this.options.lang.aria }
                },

                // this is called when creating the dropdown list
                'onBlock': function (panel, block) {
                    block.element.setHtml(that.editor.plugins.cmsplugins.setupDropdown());

                    var anchors = $(block.element.$).find('.cke_panel_listItem a');
                        anchors.bind('click', function (e) {
                            e.preventDefault();

                            that.addPlugin($(this), panel);
                        });
                }
            });

            // handle edit event via context menu
            if (this.editor.contextMenu) {
                this.setupContextMenu();
                this.editor.addCommand('cmspluginsEdit', {
                    exec: function () {
                        var selection = that.editor.getSelection();
                        var element = selection.getSelectedElement() || selection.getCommonAncestor().getAscendant('cms-plugin', true);

                        if (that.isPluginWidget(element)) {
                            that.editPlugin(element.findOne('cms-plugin'));
                        }
                    }
                });
            }

            // handle edit event on double click
            // if event is a jQuery event (touchend), than we mutate
            // event a bit so we make the payload similar to what ckeditor.event produces
            var handleEdit = function(event) {
                if (event.type === 'touchend' || event.type === 'click') {
                    var element = event.currentTarget;
                    event.data = event.data ||  {};
                    that.editor.getSelection().fake(new CKEDITOR.dom.element(element));
                } else {
                    // heavily relies on the fact that double click
                    // also selects an element
                    var selection = that.editor.getSelection();
                    var element = selection.getSelectedElement() || selection.getCommonAncestor().getAscendant('a', true);
                }
                if (that.isPluginWidget(element)) {
                    event.data.dialog = '';

                    var plugin = element.findOne('cms-plugin');

                    that.editPlugin(plugin);
                }
            }
            this.editor.on('doubleclick', handleEdit);
            this.editor.on('instanceReady', function () {
                CMS.$('cms-plugin', CMS.$('iframe.cke_wysiwyg_frame')[0]
                    .contentWindow.document.documentElement).on('click touchend', handleEdit);
            });

            // setup CKEDITOR.htmlDataProcessor
            this.setupDataProcessor();
        },

        isPluginWidget: function (element) {
            if (element && element.getAttribute('class').indexOf('cke_widget') !== -1 && element.findOne('cms-plugin')) {
                return true;
            }

            return false;
        },

        setupDialog: function () {
            var that = this;
            var definition = function () { return {
                'title': '',
                'minWidth': 600,
                'minHeight': 200,
                'contents': [{
                    'elements': [{ type: 'html', html: '<iframe style="position:static; width:100%; height:100%; border:none;" />' }]
                }],
                'onOk': function () {
                    var iframe = $(CKEDITOR.dialog.getCurrent().parts.contents.$).find('iframe').contents();
                        iframe.find('form').submit();

                    // catch the reload event and reattach
                    var reload = CMS.API.Helpers.reloadBrowser;

                    CMS.API.Helpers.reloadBrowser = function() {
                        CKEDITOR.dialog.getCurrent().hide();

                        that.insertPlugin(CMS.API.Helpers.dataBridge);

                        CMS.API.Helpers.reloadBrowser = reload;
                        return false;
                    };
                    return false;
                }
            }};

            // set default definition and open dialog
            CKEDITOR.dialog.add('cmspluginsDialog', definition);
        },

        setupDropdown: function () {
            var tpl = '<div class="cke_panel_block">';

            // loop through the groups
            $.each(this.options.plugins, function (i, group) {
                // add template
                tpl += '<h1 class="cke_panel_grouptitle">' + group.group + '</h1>';
                tpl += '<ul role="presentation" class="cke_panel_list">';
                // loop through the plugins
                $.each(group.items, function (ii, item) {
                    tpl += '<li class="cke_panel_listItem"><a href="#" rel="' + item.type + '">' + item.title + '</a></li>';
                });
                tpl += '</ul>';
            });

            tpl += '</div>';

            return tpl;
        },

        setupContextMenu: function () {
            var that = this;

            this.editor.addMenuGroup('cmspluginsGroup');
            this.editor.addMenuItem('cmspluginsItem', {
                label: this.options.lang.edit,
                icon: this.path + 'icons/cmsplugins.png',
                command: 'cmspluginsEdit',
                group: 'cmspluginsGroup'
            });

            this.editor.removeMenuItem('image');

            this.editor.contextMenu.addListener(function(element) {
                if (that.isPluginWidget(element)) {
                    return { cmspluginsItem: CKEDITOR.TRISTATE_OFF };
                }
            });
        },

        editPlugin: function (element) {
            var id = element.getAttribute('id');
            this.editor.openDialog('cmspluginsDialog');
            var body = CMS.$(document);

            // now tweak in dynamic stuff
            var dialog = CKEDITOR.dialog.getCurrent();
            dialog.resize(body.width() * 0.8, body.height() * 0.7);
            $(dialog.getElement().$).addClass('cms-ckeditor-dialog');
            $(dialog.parts.title.$).text(this.options.lang.edit);
            $(dialog.parts.contents.$).find('iframe').attr('src', '../' + id + '/?_popup=1&no_preview')
                .bind('load', function () {
                    $(this).contents().find('.submit-row').hide().end()
                        .find('#container').css('min-width', 0).css('padding', 0);
                });
        },

        addPlugin: function (item, panel) {
            var that = this;

            // hide the panel
            panel.hide();

            // lets figure out how to write something to the editor
            this.editor.focus();
            this.editor.fire('saveSnapshot');

            // gather data
            var data = {
                'placeholder_id': this.options.placeholder_id,
                'plugin_type': item.attr('rel'),
                'plugin_parent': this.options.plugin_id,
                'plugin_language':  this.options.plugin_language
            };

            that.addPluginDialog(item, data);
        },

        addPluginDialog: function (item, data) {
            var body = CMS.$(document);
            // open the dialog
            var selected_text = this.editor.getSelection().getSelectedText();
            this.editor.openDialog('cmspluginsDialog');

            // now tweak in dynamic stuff
            var dialog = CKEDITOR.dialog.getCurrent();
            dialog.resize(body.width() * 0.8, body.height() * 0.7);
            $(dialog.getElement().$).addClass('cms-ckeditor-dialog');
            $(dialog.parts.title.$).text(this.options.lang.add);
            $(dialog.parts.contents.$).find('iframe').attr('src', this.options.add_plugin_url + '?' + $.param(data))
                .bind('load', function () {
                    $(this).contents().find('.submit-row').hide().end()
                    .find('#container').css('min-width', 0).css('padding', 0)
                    .find('#id_name').val(selected_text);
                });
        },

        insertPlugin: function (data) {
            var that = this;
            var element, attrs = { id: data.plugin_id };

            element = new CKEDITOR.dom.element('cms-plugin', this.editor.document);
            $.extend(attrs, {
                'title': data.plugin_desc,
                'alt': data.plugin_type,
            });
            element.setAttributes(attrs);

            // in case it's a fresh text plugin children don't have to be
            // deleted separately
            if (!this.options.delete_on_cancel) {
                this.child_plugins.push(data.plugin_id);
            }
            this.editor.insertElement(element);
        },

        /**
         * Sets up cleanup requests. If the plugin itself or child plugin was created and then
         * creation was cancelled - we need to clean up created plugins.
         *
         * @method setupCancelCleanupCallback
         * @public
         * @param {Object} data plugin data
         */
        setupCancelCleanupCallback: function setupCancelCleanupCallback (data) {
            if (!window.parent || !window.parent.CMS || !window.parent.CMS.API || !window.parent.CMS.API.Helpers) {
                return;
            }
            var that = this;
            var CMS = window.parent.CMS;
            var cancelModalCallback = function cancelModalCallback(e, opts) {
                if (!that.options.delete_on_cancel && !that.child_plugins.length) {
                    return;
                }
                e.preventDefault();
                CMS.API.Toolbar.showLoader();
                var data = {
                    token: that.options.cancel_plugin_token
                };
                if (!that.options.delete_on_cancel) {
                    data.child_plugins = that.child_plugins;
                }
                $.ajax({
                    method: 'POST',
                    url: that.options.cancel_plugin_url,
                    data: data,
                    // use 'child_plugins' instead of default 'child_plugins[]'
                    traditional: true
                }).done(function (res) {
                    CMS.API.Helpers.removeEventListener('modal-close.text-plugin-' + that.options.plugin_id);
                    opts.instance.close();
                }).fail(function (res) {
                    CMS.API.Messages.open({
                        message: res.responseText + ' | ' + res.status + ' ' + res.statusText,
                        delay: 0,
                        error: true
                    });
                });
            };
            CMS.API.Helpers.addEventListener('modal-close.text-plugin-' + that.options.plugin_id, cancelModalCallback);
        },

        setupDataProcessor: function () {
            var that = this;

            // this.editor.dataProcessor.dataFilter.addRules({
            //     elements: {
            //         'cms-plugin': function (element) {
            //             debugger
            //             if (!element.attributes.id) {
            //                 return null;
            //             }
            //
            //             if (pluginsMap[element.attributes.id] && pluginsMap[element.atrributes.id].original &&
            //                 !element.isClone) {
            //                 return pluginsMap[element.attributes.id].original;
            //             }
            //
            //             if (!pluginsMap[element.attributes.id] && !element.isClone) {
            //                 var clone = element.clone();
            //
            //                 clone.isClone = true;
            //
            //                 if (clone.children.length) {
            //                     clone.children = [];
            //                 }
            //
            //                 pluginsMap[element.attributes.id] = {
            //                     clone: clone,
            //                     original: element
            //                 };
            //             }
            //
            //             return element;
            //         }
            //     }
            // },
            // {
            //     applyToAll: true
            // })
            //
            // this.editor.dataProcessor.htmlFilter.addRules({
            //     elements: {
            //         'cms-plugin': function (element) {
            //             debugger
            //             if (!element.attributes.id) {
            //                 return null;
            //             }
            //
            //             if (element.isClone) {
            //                 return element;
            //             }
            //
            //             return pluginsMap[element.attributes.id].clone;
            //         }
            //     }
            // }, {
            //     applyToAll: true
            // });
        }

    });

});
})(CMS.$);
