require('./Base');
require('../overlay/vectortile/DeafultCanvasStyle');
require('../overlay/vectortile/StyleMap');

ol.supermap.StyleUtils = {
    getValidStyleFromLayerInfo: function (layerInfo, feature, url) {
        var type = feature.getProperties().type,
            style = this.getDefaultStyle(type),
            shader = layerInfo.layerStyle;
        if (feature.getProperties().type === 'POINT' && layerInfo.type === 'LABEL' && feature.getProperties().attributes !== null) {
            type = 'TEXT';
            style = this.getDefaultStyle(type);
        }
        if (type === "POINT" && shader) {
            var symbolParameters = {
                "transparent": true,
                "resourceType": "SYMBOLMARKER",
                "picWidth": Math.ceil(shader.markerSize * SuperMap.DOTS_PER_INCH * SuperMap.INCHES_PER_UNIT["mm"]),
                "picHeight": Math.ceil(shader.markerSize * SuperMap.DOTS_PER_INCH * SuperMap.INCHES_PER_UNIT["mm"]),
                "style": JSON.stringify(shader)
            };
            var imageUrl = SuperMap.Util.urlAppend(url + "/symbol.png", SuperMap.Util.getParameterString(symbolParameters));
            style.pointFile = imageUrl;
            return new ol.style.Style({
                image: new ol.style.Icon({
                    src: style.pointFile
                })
            });
        } else if (type === "TEXT") {
            shader = feature.getProperties().textStyle || shader;
            if (shader) {
                var fontStr = "";
                //设置文本是否倾斜
                style.fontStyle = !!shader.italic ? "italic" : "normal";
                //设置文本是否使用粗体
                style.fontWeight = shader.bold ? shader.fontWeight : "normal";
                //设置文本的尺寸（对应fontHeight属性）和行高，行高iserver不支持，默认5像素
                //固定大小的时候单位是毫米
                var text_h = shader.fontHeight * SuperMap.DOTS_PER_INCH * SuperMap.INCHES_PER_UNIT["mm"] * 0.85;    //毫米转像素,服务端的字体貌似要稍微小一点
                style.fontSize = text_h + "px";

                //设置文本字体类型
                //在桌面字体钱加@时为了解决对联那种形式，但是在canvas不支持，并且添加了@会导致
                //字体大小被固定，这里需要去掉
                if (shader.fontName.indexOf("@")) {
                    fontStr = shader.fontName.replace(/@/g, "");
                }
                else {
                    fontStr = shader.fontName
                }
                style.fontFamily = fontStr;
                style.textHeight = text_h;

                //设置对齐方式
                var alignStr = shader.align.replace(/TOP|MIDDLE|BASELINE|BOTTOM/, "");
                style.textAlign = alignStr.toLowerCase();
                var baselineStr = shader.align.replace(/LEFT|RIGHT|CENTER/, "");
                if (baselineStr === "BASELINE")baselineStr = "alphabetic";
                style.textBaseline = baselineStr.toLowerCase();

                /*//首先判定是否需要绘制阴影，如果需要绘制，阴影应该在最下面
                 if(shader.shadow)
                 {

                 //桌面里面的阴影没有做模糊处理，这里统一设置为0,
                 style.shadowBlur=0;
                 //和桌面统一，往右下角偏移阴影，默认3像素
                 style.shadowOffsetX=3;
                 style.shadowOffsetY=3;
                 //颜色取一个灰色，调成半透明
                 style.shadowColor="rgba(50,50,50,0.5)";
                 }else{
                 style.shadowOffsetX=0;
                 style.shadowOffsetY=0;
                 }*/
                style.haloRadius = shader.outline ? shader.outlineWidth : 0;
                style.backColor = "rgba(" + shader.backColor.red + "," + shader.backColor.green + "," + shader.backColor.blue + ",1)";
                style.foreColor = "rgba(" + shader.foreColor.red + "," + shader.foreColor.green + "," + shader.foreColor.blue + ",1)";
                style.rotation = shader.rotation;
            }
            var text;
            if (feature.getProperties().texts) {
                text = feature.getProperties().texts[0];
            }
            if (layerInfo.type === 'LABEL' && feature.getProperties().attributes !== null) {
                text = feature.getProperties().attributes[layerInfo.textField];
            }
            return new ol.style.Style({
                text: new ol.style.Text({
                    font: style.fontStyle + ' ' + style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily,
                    text: text,
                    textAlign: style.textAlign,
                    textBaseline: style.textBaseline,
                    fill: new ol.style.Fill({
                        color: style.foreColor
                    }),
                    stroke: style.haloRadius > 0 ? new ol.style.Stroke({
                        color: style.backColor,
                        width: style.haloRadius
                    }) : null,
                    offsetX: style.offsetX,
                    offsetY: style.offsetY,
                    rotation: style.rotation
                })
            });
        } else if (shader) {
            //目前只实现桌面系统默认的几种symbolID，非系统默认的面用颜色填充替代，线则用实线来替代
            var fillSymbolID = shader["fillSymbolID"] > 7 ? 0 : shader["fillSymbolID"];
            var lineSymbolID = shader["lineSymbolID"] > 5 ? 0 : shader["lineSymbolID"];
            for (var attr in shader) {
                var obj = ol.supermap.StyleMap.ServerStyleMap[attr];
                var canvasStyle = obj.canvasStyle;
                if (canvasStyle && canvasStyle != "") {
                    var type = obj.type;
                    switch (type) {
                        case "number":
                            var value = shader[attr];
                            if (obj.unit) {
                                //将单位转换为像素单位
                                value = value * SuperMap.DOTS_PER_INCH * SuperMap.INCHES_PER_UNIT[obj.unit] * 2.5;
                            }
                            style[canvasStyle] = value;
                            break;
                        case "color":
                            var color = shader[attr];
                            var backColor = shader["fillBackColor"];
                            var value, alpha = 1;
                            if (canvasStyle === "fillStyle") {
                                if (fillSymbolID === 0 || fillSymbolID === 1) {
                                    //当fillSymbolID为0时，用颜色填充，为1是无填充，即为透明填充，alpha通道为0
                                    alpha = 1 - fillSymbolID;
                                    value = "rgba(" + color.red + "," + color.green + "," + color.blue + "," + alpha + ")";
                                } else {
                                    //当fillSymbolID为2~7时，用的纹理填充,但要按照前景色修改其颜色
                                    try {
                                        var tempCvs = document.createElement("canvas");
                                        tempCvs.height = 8;
                                        tempCvs.width = 8;
                                        var tempCtx = tempCvs.getContext("2d");
                                        var image = new Image();
                                        tempCtx.drawImage(this.layer.fillImages["System " + fillSymbolID], 0, 0);
                                        var imageData = tempCtx.getImageData(0, 0, tempCvs.width, tempCvs.height);
                                        var pix = imageData.data;
                                        for (var i = 0, len = pix.length; i < len; i += 4) {
                                            var r = pix[i], g = pix[i + 1], b = pix[i + 2];
                                            //将符号图片中的灰色或者黑色的部分替换为前景色，其余为后景色
                                            if (r < 225 && g < 225 && b < 225) {
                                                pix[i] = color.red;
                                                pix[i + 1] = color.green;
                                                pix[i + 2] = color.blue;
                                            } else if (backColor) {
                                                pix[i] = backColor.red;
                                                pix[i + 1] = backColor.green;
                                                pix[i + 2] = backColor.blue;
                                            }
                                        }
                                        tempCtx.putImageData(imageData, 0, 0);
                                        image.src = tempCvs.toDataURL();

                                        value = this.context.createPattern(image, "repeat");
                                    } catch (e) {
                                        throw Error("cross-origin");
                                    }
                                }
                            } else if (canvasStyle === "strokeStyle") {
                                if (lineSymbolID === 0 || lineSymbolID === 5) {
                                    //对于lineSymbolID为0时，线为实线，为lineSymbolID为5时，为无线模式，即线为透明，即alpha通道为0
                                    alpha = lineSymbolID === 0 ? 1 : 0;
                                } else {
                                    //以下几种linePattern分别模拟了桌面的SymbolID为1~4几种符号的linePattern
                                    var linePattern = [1, 0];
                                    switch (lineSymbolID) {
                                        case 1:
                                            linePattern = [9.7, 3.7];
                                            break;
                                        case 2:
                                            linePattern = [3.7, 3.7];
                                            break;
                                        case 3:
                                            linePattern = [9.7, 3.7, 2.3, 3.7];
                                            break;
                                        case 4:
                                            linePattern = [9.7, 3.7, 2.3, 3.7, 2.3, 3.7];
                                            break;
                                        default:
                                            break
                                    }
                                    style.lineDasharray = linePattern;
                                }
                                value = "rgba(" + color.red + "," + color.green + "," + color.blue + "," + alpha + ")";
                            }
                            style[canvasStyle] = value;
                            break;
                        default:
                            break;
                    }
                }
            }
        }
        if (feature.getProperties().type === 'LINE') {
            return new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: style.strokeStyle,
                    width: style.lineWidth,
                    lineCap: style.lineCap,
                    lineDash: style.lineDasharray,
                    lineDashOffset: style.lineDashOffset,
                    lineJoin: style.lineJoin,
                    miterLimit: style.miterLimit
                })
            });
        }
        if (feature.getProperties().type === 'REGION') {
            var fill = new ol.style.Fill({
                color: style.fillStyle
            });
            var stroke = new ol.style.Stroke({
                color: style.strokeStyle,
                width: style.lineWidth,
                lineCap: style.lineCap,
                lineDash: style.lineDasharray,
                lineDashOffset: style.lineDashOffset,
                lineJoin: style.lineJoin,
                miterLimit: style.miterLimit
            });
            return new ol.style.Style({
                fill: fill,
                stroke: stroke
            });
        }
    },

    getStyleFromCarto: function (zoom, scale, shader, feature, fromServer, url) {
        var type = feature.getProperties().type,
            attributes = {},
            style = this.getDefaultStyle(type);
        attributes.FEATUREID = feature.getProperties().id;
        attributes.SCALE = scale;
        var cartoStyleMap = ol.supermap.StyleMap.CartoStyleMap[type];
        var fontSize, fontName;
        if (shader) {
            for (var i = 0, len = shader.length; i < len; i++) {
                var _shader = shader[i];
                var prop = cartoStyleMap[_shader.property];
                var value = _shader.getValue(attributes, zoom, true);
                if ((value !== null) && prop) {
                    if (prop === "fontSize") {
                        if (fromServer) {
                            value *= 0.8;
                        }
                        //斜杠后面为行间距，默认为0.5倍行间距
                        fontSize = value + "px";
                        style.fontSize = fontSize;
                    } else if (prop === "fontName") {
                        fontName = value;
                    } else {
                        if (prop === "globalCompositeOperation") {
                            value = ol.supermap.StyleMap.CartoCompOpMap[value];
                            if (!value || value === "")continue;
                        } else if (fromServer && prop === 'pointFile') {
                            value = url + '/tileFeature/symbols/' + value.replace(/(___)/gi, '@');
                        }
                        if (prop === 'lineWidth' && value < 1) {
                            value = Math.ceil(value);
                        }
                        style[prop] = value;
                    }
                }
            }
        }
        if (feature.getProperties().type === 'TEXT') {
            return new ol.style.Style({
                text: new ol.style.Text({
                    font: style.fontStyle + ' ' + style.fontWeight + ' ' + style.fontSize + ' ' + style.fontFamily,
                    text: feature.getProperties().texts[0],
                    textAlign: style.textAlign,
                    textBaseline: style.textBaseline,
                    fill: new ol.style.Fill({
                        color: style.foreColor
                    }),
                    stroke: new ol.style.Stroke({
                        color: style.backColor
                    }),
                    offsetX: style.offsetX,
                    offsetY: style.offsetY
                })
            })
        }
        if (feature.getProperties().type === 'POINT') {
            if (style.pointFile !== '') {
                return new ol.style.Style({
                    image: new ol.style.Icon({
                        src: style.pointFile
                    })
                });
            }
            return new ol.style.Style({
                image: new ol.style.Circle({
                    radius: style.pointRadius,
                    fill: new ol.style.Fill({
                        color: style.fillStyle
                    }),
                    stroke: new ol.style.Stroke({
                        color: style.pointHaloColor,
                        width: style.pointHaloRadius
                    })
                })
            });
        }
        if (feature.getProperties().type === 'LINE') {
            return new ol.style.Style({
                stroke: new ol.style.Stroke({
                    color: style.strokeStyle,
                    width: style.lineWidth,
                    lineCap: style.lineCap,
                    lineDash: style.lineDasharray,
                    lineDashOffset: style.lineDashOffset,
                    lineJoin: style.lineJoin,
                    miterLimit: style.miterLimit
                })
            });
        }
        if (feature.getProperties().type === 'REGION') {
            var fill = new ol.style.Fill({
                color: style.fillStyle
            });
            var stroke = new ol.style.Stroke({
                color: style.strokeStyle,
                width: style.lineWidth,
                lineCap: style.lineCap,
                lineDash: style.lineDasharray,
                lineDashOffset: style.lineDashOffset,
                lineJoin: style.lineJoin,
                miterLimit: style.miterLimit
            });
            return new ol.style.Style({
                fill: fill,
                stroke: stroke
            });
        }
    },

    getDefaultStyle: function (type) {
        var style = style || {};
        var canvasStyle = ol.supermap.DeafultCanvasStyle[type];
        for (var prop in canvasStyle) {
            var val = canvasStyle[prop];
            style[prop] = val;
        }
        return style;
    }

};

module.exports = function () {
    return new ol.supermap.StyleUtils();
};