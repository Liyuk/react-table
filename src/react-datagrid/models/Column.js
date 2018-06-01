'use strict';

var humanize = require('ustring').humanize
var assign   = require('object-assign')

function getVisibleInfo(col){
    var visible = true
    var defaultVisible

    if (col.hidden != null){
        visible = !col.hidden
    } else if (col.visible != null){
        visible = !!col.visible
    } else {
        //no visible or hidden specified
        //so we look for defaultVisible/defaultHidden

        if (col.defaultHidden != null){
            defaultVisible = !col.defaultHidden
        } else if (col.defaultVisible != null){
            defaultVisible = !!col.defaultVisible
        }

        visible = defaultVisible
    }

    return {
        visible: visible,
        defaultVisible: defaultVisible
    }
}

var Column = function(col, props){

    col = assign({}, Column.defaults, col)

    //title
    if (!col.title){
        col.title = humanize(col.name)
    }

    //sortable
    if (props && !props.sortable){
        col.sortable = false
    }
    col.sortable = !!col.sortable

    //resizable
    if (props && props.resizableColumns === false){
        col.resizable = false
    }
    col.resizable = !!col.resizable

    //filterable
    if (props && props.filterable === false){
        col.filterable = false
    }
    col.filterable = !!col.filterable

    var visibleInfo = getVisibleInfo(col)
    var visible = visibleInfo.visible

    if (visibleInfo.defaultVisible != null){
        col.defaultHidden  = !visibleInfo.defaultVisible
        col.defaultVisible = visibleInfo.defaultVisible
    }

    //hidden
    col.hidden = !visible
    //visible
    col.visible  = visible

    if (col.width == null && col.defaultWidth){
        col.width = col.defaultWidth
    }

    //flexible
    col.flexible = !col.width

    return col
}

Column.displayName = 'Column'

Column.defaults = {
    sortable  : true,
    filterable: true,
    resizable : true,
    defaultVisible: true,
    type      : 'string',

    /**
     * 过滤器外观渲染
     *
     * @param column
     * @param oldTxt
     * @param onFilterInfoChange(name, txt)
     */
    // filterRender : function (column, oldTxt, onFilterInfoChange) {},

    /**
     * 行数据过滤方法
     *
     * @param dataItem
     * @param txt
     * @param columnFilterMap = {name: txt, ...}
     */
    // dataFilter: function (dataItem, txt, columnFilterMap) {},

    /**
     * 服务端搜索，合并搜索参数
     *
     * 可为Boolean
     *
     * 可为函数
     * @param dataSourceQuery
     * @param {String} txt
     * @param {Object} column
     * @return {Object} need reduce object
     * function (txt, dataSourceQuery, column) {}
     */
     searchable: false
};

module.exports = Column