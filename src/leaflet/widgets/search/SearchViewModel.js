/* Copyright© 2000 - 2018 SuperMap Software Co.Ltd. All rights reserved.
 * This program are made available under the terms of the Apache License, Version 2.0
 * which accompanies this distribution and is available at http://www.apache.org/licenses/LICENSE-2.0.html.*/
import L from "leaflet";
import '../../core/Base';
import {GeoCodingParameter} from '@supermap/iclient-common';
import {AddressMatchService} from '../../services/AddressMatchService';
import {GeoJsonLayersDataModel} from '../commonmodels/GeoJsonLayersModel';

/**
 * @class L.supermap.widgets.searchViewModel
 * @classdesc 图层查询微件功能类。
 * @category Widgets Search
 * @param {Object} options - 可选参
 * @param {Object} [options.cityGeoCodingConfig] - 城市地址匹配服务配置，包括：{addressUrl:"",key:""} 默认为 online 地址匹配服务，与 options.cityConfig 对应。
 * @fires L.supermap.widgets.searchViewModel#newlayeradded
 * @fires L.supermap.widgets.searchViewModel#searchlayersucceed
 * @fires L.supermap.widgets.searchViewModel#searchfield
 * @fires L.supermap.widgets.searchViewModel#geocodesucceed
 */
export var SearchViewModel = L.Evented.extend({
    options: {
        cityGeoCodingConfig: {
            addressUrl: "http://www.supermapol.com/iserver/services/location-china/rest/locationanalyst/China",
            key: "fvV2osxwuZWlY0wJb8FEb2i5"
        }
    },

    initialize(map, options) {
        if (map) {
            /**
             * @member {L.Map} [L.supermap.widgets.searchViewModel.prototype.map]
             * @description 当前微件所在的底图。
             */
            this.map = map;
        } else {
            return new Error(`Cannot find map, fileModel.map cannot be null.`);
        }

        if (options) {
            L.setOptions(this, options);
        }
        //初始化Model
        this.dataModel = new GeoJsonLayersDataModel();
        //初始话地址匹配服务

        this.geoCodeService = new AddressMatchService(this.options.cityGeoCodingConfig.addressUrl);
        this.geoCodeParam = new GeoCodingParameter({
            address: null,
            city: "北京市",
            maxResult: 70,
            prjCoordSys: JSON.stringify({epsgCode: 4326}),
            key: this.options.cityGeoCodingConfig.key
        });
        //查询缓存
        this.searchCache = {};

        //监听 dataModel 数据变化：//看如何优化
        this.dataModel.on("newlayeradded", (e) => {
            /**
             * @event L.supermap.widgets.searchViewModel#newlayeradded
             * @description 添加查询图层事件
             * @property {Object} result  - 事件返回的新的查询图层对象。
             * @property {string} layerName  - 事件返回的新的查询图层对象名。
             */
            this.fire("newlayeradded", {layerName: e.layerName});
        });
    },

    /**
     * @function L.supermap.widgets.searchViewModel.prototype.search
     * @description 查询。
     * @param {string} keyWord - 查询的关键字。
     * @param {string} [searchLayerName] - 执行的查询类型，支执行矢量图层属性查询，当为 "geocode" 则执行地址匹配。
     */
    search(keyWord, searchLayerName) {
        if (!searchLayerName) {
            this.searchFromCityGeocodeService(keyWord);
        } else {
            this.searchFromLayer(keyWord, searchLayerName);
        }
    },

    /**
     * @function L.supermap.widgets.searchViewModel.prototype.searchFromLayer
     * @description 图层属性查询。
     * @param {string} searchLayerName - 查询的图层名。
     * @param {string} keyWord - 图层属性搜索关键字。
     */
    searchFromLayer(keyWord, searchLayerName) {
        if (this.dataModel.layers[searchLayerName]) {
            let resultFeatures = this.dataModel.layers[searchLayerName].getFeaturesByKeyWord(keyWord);
            if (resultFeatures && resultFeatures.length > 0) {
                /**
                 * @event L.supermap.widgets.searchViewModel#searchlayersucceed
                 * @description 图层属性查询成功后触发。
                 * @property {Object} result - 图层数据。
                 */
                this.fire("searchlayersucceed", {result: resultFeatures});
            } else {
                /**
                 * @event L.supermap.widgets.searchViewModel#searchfield
                 * @description 图层属性查询失败后触发。
                 * @property {string} searchType - 图层属性查询状态。
                 */
                this.fire("searchfield", {searchType: "searchLayersField"});
            }
        }
    },

    /**
     * @function L.supermap.widgets.searchViewModel.prototype.searchFromCityGeocodeService
     * @description 城市地址匹配查询。
     * @param {string} keyWords - 城市地址匹配查询关键字。
     */
    searchFromCityGeocodeService(keyWords) {
        //todo 是否保留缓存？请求过的数据保留一份缓存？
        if (this.searchCache[keyWords]) {
            /**
             * @event L.supermap.widgets.searchViewModel#geocodesucceed
             * @description 城市地址匹配成功够触发。
             * @property {Object} result - 城市匹配成功后返回的数据。
             */
            this.fire("geocodesucceed", {result: this.searchCache[keyWords]});
        } else {
            this.geoCodeParam.address = keyWords;
            const self = this;
            this.geoCodeService.code(this.geoCodeParam, (geocodingResult) => {
                if (geocodingResult.result) {
                    if (geocodingResult.result.error || geocodingResult.result.length === 0) {
                        self.fire("searchfield", {searchType: "searchGeocodeField"});
                        return;
                    }
                    const geoJsonResult = self._dataToGeoJson(geocodingResult.result);
                    self.fire("geocodesucceed", {result: geoJsonResult});
                }

            });
        }
    },

    /**
     * @function L.supermap.widgets.searchViewModel.prototype.addSearchLayers
     * @description 添加新的可查询图层。
     * @param {Array.<L.GeoJSON>} layers - 新添加的图层对象。
     */
    addSearchLayers(layers) {
        this.dataModel.addLayers(layers)
    },

    /**
     * @function L.supermap.widgets.searchViewModel.prototype.panToLayer
     * @description 缩放到指定图层。
     * @param {string} layerName - 指定缩放的图层名。
     */
    panToLayer(layerName) {
        if (this.dataModel.layers[layerName]) {
            this.map.flyToBounds(this.dataModel.layers[layerName].layer.getBounds());
        }
    },

    /**
     * @function L.supermap.widgets.searchViewModel.prototype.panToCity
     * @description 缩放到指定城市。
     * @param {string} city - 指定缩放的城市名。
     */
    panToCity(city) {
        this.geoCodeParam.address = city;
        this.geoCodeParam.city = city;
        const self = this;
        this.geoCodeService.code(this.geoCodeParam, (geocodingResult) => {
            if (geocodingResult.result.length > 0) {
                //缩放至城市
                const center = L.latLng(geocodingResult.result[0].location.y, geocodingResult.result[0].location.x);
                self.map.setView(center, 8);
            } else {
                self.fire("searchfield", {searchType: "cityGeocodeField"});
            }

        });

    },

    /**
     * @description 将地址匹配返回的数据转为geoJson 格式数据
     * @param data
     * @private
     */
    _dataToGeoJson(data) {
        let features = [];
        for (let i = 0; i < data.length; i++) {
            let feature = {
                type: "Feature",
                geometry: {
                    type: "Point",
                    coordinates: [data[i].location.x, data[i].location.y]
                },
                properties: {
                    name: data[i].name,
                    address: data[i].formatedAddress
                }
            };
            features.push(feature);
        }

        return features;
    }

});

export var searchViewModel = function (options) {
    return new SearchViewModel(options);
};

L.supermap.widgets.searchViewModel = searchViewModel;
