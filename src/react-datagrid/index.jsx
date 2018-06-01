'use strict';

require('es6-promise').polyfill()

var React    = require('react')
var ReactDOM = require('react-dom');
var assign   = require('object-assign')
var LoadMask = require('react-load-mask')
var Region   = require('region')

var PaginationToolbar = React.createFactory(require('./PaginationToolbar'))
var Column = require('./models/Column')

var PropTypes      = require('./PropTypes')
var Wrapper        = require('./Wrapper')
var Header         = require('./Header')
var FilterHeader      = require('./FilterHeader')
var WrapperFactory = React.createFactory(Wrapper)
var HeaderFactory  = React.createFactory(Header)
var FilterHeaderFactory  = React.createFactory(FilterHeader)
var ResizeProxy = require('./ResizeProxy')

var findIndexByName = require('./utils/findIndexByName')
var group           = require('./utils/group')

var slice          = require('./render/slice')
var getTableProps    = require('./render/getTableProps')
var getGroupedRows = require('./render/getGroupedRows')
var renderMenu     = require('./render/renderMenu')

var preventDefault = require('./utils/preventDefault')

var getIndexForGroupById = require('./utils/getIndexForGroupById')

var isArray = Array.isArray
var IS_MAC  = global && global.navigator && global.navigator.appVersion && global.navigator.appVersion.indexOf("Mac") != -1

var SIZING_ID = '___SIZING___'

function clamp(value, min, max){
    return value < min?
        min:
        value > max?
            max:
            value
}

function signum(x){
    return x < 0? -1: 1
}

function emptyFn(){}

function getVisibleCount(props, state){
    return getVisibleColumns(props, state).length
}

function getVisibleColumns(props, state){

    var visibility     = state.visibility
    var visibleColumns = props.columns.filter(function(c){
        var name = c.name
        var visible = c.visible

        if (name in visibility){
            visible = !!visibility[name]
        }

        return visible
    })

    return visibleColumns
}

function getColumnsWidth (columns) {

    if(!columns || columns.length === 0) {
        return 0
    }

    var width = 0
    var tmpWidth

    columns.forEach(function(column) {
        if(column.columns) {
            columns.resizable = false
            width += getColumnsWidth(column.columns)
        } else {
            tmpWidth = parseInt(column.width, 10)

            if(tmpWidth !== tmpWidth)   // 处理 NAN
                tmpWidth = 0

            width += tmpWidth
        }
    })

    return width
}

/**
 * 根据规则获取相关columns
 * @param  { object } columns
 * @param  {[type]} property 属性
 * @param  {[type]} val      属性值
 * @param  {[type]} colFn    找到的每个对象进行的操作
 */
function getColumnsBy (columns, property, val, colFn) {
    return (columns || []).filter(function(col) {
        if(col[property] && col[property] === val) {
            colFn && colFn(col)
            return true
        }
        return false
    })
}

function findColumn(columns, column){

    var name = typeof column === 'string'? column: column.name
    var index = findIndexByName(columns, name)

    if (~index){
        return columns[index]
    }
}

module.exports = React.createClass({

    displayName: 'ReactDataGrid',

    mixins: [
        require('./RowSelect'),
        require('./ColumnFilter')
    ],

    /**
     * virtualRendering，滚动时
     * 用于提升性能的优化参数
     */
    _performanceCacheForScrollTop: null,
    /**
     * 左右两端是否有固定展示的 table
     * 没有的时候不处理 row 上的 hover，提升性能优化
     */
    _hasFixTable                 : null,

    propTypes: {
        loading          : React.PropTypes.bool,
        virtualRendering : React.PropTypes.bool,

        //specify false if you don't want any column to be resizable
        resizableColumns : React.PropTypes.bool,
        filterable: React.PropTypes.bool,

        //specify false if you don't want column menus to be displayed
        withColumnMenu   : React.PropTypes.bool,
        cellEllipsis     : React.PropTypes.bool,//文本益处显示省略号
        showCellBorders : React.PropTypes.bool,//显示表格宽度
        pagination: React.PropTypes.bool,//显示分页
        sortable         : React.PropTypes.bool,
        loadMaskOverHeader : React.PropTypes.bool,
        idProperty       : React.PropTypes.string.isRequired,

        //you can customize the column menu by specifying a factory
        columnMenuFactory: React.PropTypes.func,
        onDataSourceResponse: React.PropTypes.func,
        onDataSourceSuccess: React.PropTypes.func,
        onDataSourceError: React.PropTypes.func,

        //sub grid
        subGridHeight: React.PropTypes.func || PropTypes.numeric, //when virtualRendering==true isRequired
        renderSubGrid: React.PropTypes.func,
        // alias: subGridVisibleItemList
        expandedSubGridList: React.PropTypes.object,
        // onExpandedSubGridChange: React.PropTypes.func,

        /**
         * @cfg {Number/String} columnMinWidth=50
         */
        columnMinWidth   : PropTypes.numeric,
        scrollBy         : PropTypes.numeric,
        rowHeight        : React.PropTypes.func || PropTypes.numeric, //when virtualRendering==true isRequired
        sortInfo         : PropTypes.sortInfo,
        columns          : PropTypes.column,

        dataSourceQuery  : React.PropTypes.object,

        data: function(props, name){
            var value = props[name]
            if (isArray(value)){
                return new Error('We are deprecating the "data" array prop. Use "dataSource" instead! It can either be an array (for local data) or a remote data source (string url, promise or function)')
            }
        }
    },

    getDefaultProps: require('./getDefaultProps'),

    componentDidMount: function(){
        this._isUnmounted = false;
        window.addEventListener('click', this.windowClickListener = this.onWindowClick)
        // this.checkRowHeight(this.props)
    },

    componentWillUnmount: function(){
        this._isUnmounted = true;
        this.scroller = null
        window.removeEventListener('click', this.windowClickListener)
    },

    // checkRowHeight: function(props) {
    //     if (this.isVirtualRendering(props)){

    //         //if virtual rendering and no rowHeight specifed, we use
    //         var row = this.findRowById(SIZING_ID)
    //         var config = {}

    //         if (row){
    //             this.setState({
    //                 rowHeight: config.rowHeight = row.offsetHeight
    //             })
    //         }

    //         //this ensures rows are kept in view
    //         this.updateStartIndex(props, undefined, config)
    //     }
    // },

    onWindowClick: function(event){
        if (this.state.menu){
            this.setState({
                menuColumn: null,
                menu      : null
            })
        }
    },

    getInitialState: function(){

        var props = this.props
        var defaultSelected = props.defaultSelected

        return {
            startIndex: 0,
            scrollLeft: 0,
            scrollTop : 0,
            menuColumn: null,
            defaultSelected: defaultSelected,
            visibility: {},
            /**
             * 显示子表格的数据
             * 格式与多选的selected相同
             * 如：{idProperty1:obj1,idProperty2:obj2,}
             */
            
            subGridVisibleItemList: {},
            defaultPageSize: props.defaultPageSize,
            defaultPage : props.defaultPage,

            /**
             * 过滤条件map
             */
            columnFilterMap: {},

            /**
             * 服务器数据过滤参数
             */
            dataSourceQuery: this.props.dataSourceQuery || {},

            /**
             * 实现 fixed 添加的一些 state 属性
             */
            // 当前 Hover 的 行 index
            hoverRowIndex: null,
            // 滚动条所在位置(left, middle, right)
            scrollPosition: null,
            // 是否有水平滚动条
            hasHorizontalScroller: false
        }
    },

    updateStartIndex: function() {
        this.handleScrollTop()
    },

    handleWrapperResize: function() {
        this._updateHasHorizontalScroller()
    },

    handleScrollLeft: function(scrollLeft, event){
        event = event || {}
        var curTarget = event.currentTarget
        var scrollPosition

        // 判断水平滚动条位置
        if(curTarget) {
            if(curTarget.scrollLeft === 0) {
                scrollPosition = 'left'
            } else if(curTarget.scrollLeft + 1 >=
                curTarget.children[0].getBoundingClientRect().width -
                curTarget.getBoundingClientRect().width) {
                scrollPosition = 'right'
            } else if(this.state.scrollPosition !== 'middle') {
                scrollPosition = 'middle'
            }
        }

        var changeInfo = {
            scrollLeft: scrollLeft,
            menuColumn: null
        }

        // 设置有 scroller
        if(this.state.hasHorizontalScroller === false) {
            changeInfo.hasHorizontalScroller = true
        }

        // 设置 scrollPosition
        if(this._hasFixTable && scrollPosition && this.state.scrollPosition !== scrollPosition) {
            changeInfo.scrollPosition = scrollPosition
        }

        this.setState(changeInfo)
    },

    handleScrollTop: function(scrollTop, event){
        var props = this.p
        var state = this.state

        scrollTop = scrollTop === undefined? this.state.scrollTop: scrollTop

        state.menuColumn = null

        this.scrollTop = scrollTop

        if (props.virtualRendering) {
            let {startIndex,topOffset} = this.getStartIndexAndTopOffset(props, state, scrollTop);
            state.startIndex = startIndex;
            state.topOffset = topOffset;

            // var prevIndex        = this.state.startIndex || 0
            // var data = this.prepareData(props)

            // if (renderStartIndex >= data.length){
            //     renderStartIndex = 0
            // }

            // state.renderStartIndex = renderStartIndex

            // var endIndex = this.getRenderEndIndex(props, state)

            // if (endIndex > data.length){
            //     renderStartIndex -= data.length - endIndex
            //     renderStartIndex = Math.max(0, renderStartIndex)

            //     state.renderStartIndex = renderStartIndex
            // }

            // // console.log('scroll!');
            // var sign = signum(renderStartIndex - prevIndex)

            // state.topOffset = -sign * Math.ceil(scrollTop - state.renderStartIndex * this.props.rowHeight)

            // console.log(scrollTop, sign);
        }
        if(state.hoverRowIndex !== null) {
            state.hoverRowIndex = null
        }

        state.scrollTop = scrollTop
        this.handleMultiVerticalScroll(scrollTop, event)

        this.setState(state)
    },

    handleMultiVerticalScroll: function(scrollTop, event) {
        if(!this._hasFixTable) {
            return
        }
        var mainWrapper = this.refs.wrapper
        var leftWrapper = this.refs['wrapper-left']
        var rightWrapper = this.refs['wrapper-right']

        if(mainWrapper) {
            mainWrapper.syncVerticalScrollbar(scrollTop, event)
        }
        if(leftWrapper) {
            leftWrapper.syncVerticalScrollbar(scrollTop, event)
        }
        if(rightWrapper) {
            rightWrapper.syncVerticalScrollbar(scrollTop, event)
        }
    },

    getStartIndexAndTopOffset: function (props, state, scrollTop) {
        // calc default rowHeight without row data
        var rowHeight = typeof props.rowHeight === 'number' ? props.rowHeight : props.rowHeight();
        //reset
        if (scrollTop < rowHeight) {
            this._resetPerformanceCacheForScrollTop();
        }
        //get performance cache
        var pfCache = this._performanceCacheForScrollTop;
        var isAddFun = pfCache.scrollTop <= scrollTop,//算法，增加、减少
            startIndex = pfCache.startIndex,
            sumRowHeight = pfCache.sumRowHeight,
            increaseHeight = 0,
            tempRowHeight = sumRowHeight;

        //calculating
        var vo, lg = props.data.length;
        if (state.groupData && state.groupData.groupsCount) {
            lg += state.groupData.groupsCount
        }
        for (; startIndex < lg; isAddFun ? startIndex++ : startIndex--) {
            vo = isAddFun ? props.data[startIndex] : props.data[startIndex - 1];
            //increase
            increaseHeight = this._getRowHeight(props, vo);
            //do increase
            increaseHeight = (isAddFun ? 1 : -1) * increaseHeight;
            tempRowHeight += increaseHeight;
            //check
            if (isAddFun) {
                if (tempRowHeight > scrollTop) {//will overflow break
                    break;
                }
            } else {
                if (sumRowHeight <= scrollTop) {//is normal break
                    break;
                }
            }
            sumRowHeight += increaseHeight;
        }

        //log startIndex state
        assign(pfCache, {
            scrollTop: scrollTop,
            startIndex: startIndex,
            sumRowHeight: sumRowHeight
        });

        return {
            startIndex: startIndex,
            topOffset: sumRowHeight < scrollTop//will overflow
                ? sumRowHeight - scrollTop//cal topOffset
                : 0
        };
    },

    _resetPerformanceCacheForScrollTop(){
        var pfCache = this._performanceCacheForScrollTop;
        if (!pfCache) {
            pfCache = this._performanceCacheForScrollTop = {}
        }
        assign(pfCache, {
            scrollTop: 0,
            startIndex: 0,
            sumRowHeight: 0
        });
    },

    _getRowHeight(props, vo){
        return this.isSubGridRender() && this._subGridIsOpen(vo)
            ? (typeof props.rowHeight === 'number' ? props.rowHeight : props.rowHeight(vo)) +
                (typeof props.subGridHeight === 'number' ? props.subGridHeight : props.subGridHeight(vo))
            : typeof props.rowHeight === 'number' ? props.rowHeight : props.rowHeight(vo)
    },

    getRenderEndIndex: function(props, state){
        var startIndex = state.startIndex
        var rowCount   = props.rowCountBuffer
        var length     = props.data.length

        if (state.groupData && state.groupData.groupsCount) {
            length += state.groupData.groupsCount
        }

        if (!rowCount){
            var maxHeight
            if (props.style && typeof props.style.height === 'number'){
                maxHeight = props.style.height
            } else {
                maxHeight = window.screen.height
            }
            
            var rowHeight = typeof props.rowHeight === 'number' ? props.rowHeight : props.rowHeight();
            rowCount = Math.floor(maxHeight / rowHeight)
        }

        var endIndex = startIndex + rowCount

        if (endIndex > length - 1){
            endIndex = length
        }

        return endIndex
    },

    onDropColumn: function(index, dropIndex){
        ;(this.props.onColumnOrderChange || emptyFn)(index, dropIndex)
    },

    toggleColumn: function(props, column){

        var visible = column.visible
        var visibility = this.state.visibility

        if (column.name in visibility){
            visible = visibility[column.name]
        }

        column = findColumn(this.props.columns, column)

        // 不允许取消 fixed 的列
        if(!column || column.fixed) {
            return
        }

        if (visible && getVisibleCount(props, this.state) === 1){
            return
        }

        var onHide  = this.props.onColumnHide || emptyFn
        var onShow  = this.props.onColumnShow || emptyFn

        visible?
            onHide(column):
            onShow(column)

        var onChange = this.props.onColumnVisibilityChange || emptyFn

        onChange(column, !visible)

        if (column.visible == null && column.hidden == null){
            var visibility = this.state.visibility

            visibility[column.name] = !visible

            this.cleanCache()
            this.setState({})
        }

        this._updateHasHorizontalScroller()
    },

    cleanCache: function() {
        //so grouped rows are re-rendered
        delete this.groupedRows

        //clear row cache
        this.rowCache = {}
    },

    showMenu: function(menu, state){

        state = state || {}
        state.menu = menu

        if (this.state.menu){
            this.setState({
                menu: null,
                menuColumn: null
            })
        }

        setTimeout(function(){
            //since menu is hidden on click on window,
            //show it in a timeout, after the click event has reached the window
            this.setState(state)
        }.bind(this), 0)
    },

    prepareHeader: function(props, state, options){
        // 添加options 参数作为渲染固定列的判断依据 { columns: [], fixed: 'left' | 'right' }
        var allColumns, columns

        if(options) {
            allColumns  = options.columns
            columns     = getVisibleColumns(options, state)
        } else {
            allColumns = props.columns
            columns    = getVisibleColumns(props, state)
        }

        this._renderSubHeader = this.renderSubHeader.bind(this, props)

        return (props.headerFactory || HeaderFactory)({
            scrollLeft       : options ? 0 : state.scrollLeft,
            resizing         : state.resizing,
            columns          : columns,
            allColumns       : allColumns,
            columnVisibility : state.visibility,
            cellPadding      : props.headerPadding || props.cellPadding,
            filterIconColor  : props.filterIconColor,
            menuIconColor    : props.menuIconColor,
            menuIcon    : props.menuIcon,
            filterIcon    : props.filterIcon,
            scrollbarSize    : props.scrollbarSize,
            sortInfo         : props.sortInfo,
            resizableColumns : props.resizableColumns,
            reorderColumns   : props.reorderColumns,
            filterable: props.filterable,
            withColumnMenu   : props.withColumnMenu,
            sortable         : props.sortable,

            onDropColumn     : this.onDropColumn,
            onSortChange     : props.onSortChange,
            onColumnResizeDragStart: this.onColumnResizeDragStart,
            onColumnResizeDrag: this.onColumnResizeDrag,
            onColumnResizeDrop: this.onColumnResizeDrop,

            toggleColumn     : this.toggleColumn.bind(this, props),
            showMenu         : this.showMenu,
            filterMenuFactory : this.filterMenuFactory,
            menuColumn       : state.menuColumn,
            columnMenuFactory: props.columnMenuFactory,

            className: props.virtualRendering ? null : 'z-un-virtual-rendering',
            showGroupName: false,
            renderSubHeader: this._renderSubHeader
        })
    },

    renderSubHeader: function (props, column) {
        var columns = column.columns

        return (props.headerFactory || HeaderFactory)({
            columns: columns,
            allColumns: columns,
            cellPadding: props.headerPadding || props.cellPadding,
            withColumnMenu: false,
            showGroupName: column.showGroupName,
            isGroup: column.isGroup,
            title: column.title,

            className: 'z-sub-header',
            renderSubHeader: this._renderSubHeader
        })
    },

    prepareFilterHeader: function (props, state, options) {
        if (props.filterable === false)
            return '';
        var allColumns, columns

        if(options) {
            allColumns  = props.columns
            columns     = getVisibleColumns(options, state)
        } else {
            allColumns = props.columns
            columns    = getVisibleColumns(props, state)
        }

        return FilterHeaderFactory({
            scrollLeft       : options ? 0 : state.scrollLeft,
            resizing         : state.resizing,
            columns          : columns,
            allColumns       : allColumns,
            columnVisibility : state.visibility,
            scrollbarSize    : props.scrollbarSize,

            className        : props.virtualRendering ? null : 'z-un-virtual-rendering',
            showGroupName    : false,
            columnFilterMap  : state.columnFilterMap,
            onFilterInfoChange: this.handleFilterInfoChange
        })
    },

    handleFilterInfoChange(columnName, sTxt){
        let columnFilterMap = this.state.columnFilterMap;
        let hasChange = false;

        // sTxt 可搜索时，才加入搜索
        if (sTxt !== null && sTxt !== undefined && sTxt !== '') {
            if (columnFilterMap[columnName] !== sTxt) {
                columnFilterMap[columnName] = sTxt;
                hasChange = true;
            }
        } else if (columnFilterMap.hasOwnProperty(columnName)) {
            delete columnFilterMap[columnName];
            hasChange = true;
        }

        if (!hasChange)
            return;

        // 兼容官网原始过滤器
        let onFilter = this.props.onFilter;
        if (onFilter) {
            console.warn('onFilter is deprecated. Place use column.dataFilter.');
            onFilter({name: columnName}, sTxt, columnFilterMap, null);
            return;
        }

        // 服务端过滤判断
        let column = this.props.columns.filter(column=>column.name == columnName)[0];
        if (column && column.searchable) {
            let dataSourceQuery = this.state.dataSourceQuery;

            let searchable = column.searchable;

            let needMerge = null;
            if (typeof searchable === 'function') {
                needMerge = searchable(sTxt, dataSourceQuery, column);
            } else {
                needMerge = {};
                needMerge[columnName] = sTxt;
            }

            if (needMerge) {
                Object.keys(needMerge).forEach(key=> {
                    let sTxt = needMerge[key];
                    if (sTxt === '' || sTxt == undefined || sTxt === null) {
                        if (dataSourceQuery.hasOwnProperty(columnName)) {
                            delete dataSourceQuery[columnName];
                        }
                    } else {
                        dataSourceQuery[columnName] = sTxt;
                    }
                })
            }

            // 服务端过滤，并回到顶页面
            if (this.isMounted()) {
                this.gotoPage(1);
            }
        } else {
            this.forceUpdate();
        }
    },

    prepareFooter: function(props, state){
        return (props.footerFactory || React.DOM.div)({
            className: 'z-footer-wrapper'
        })
    },

    prepareRenderProps: function(props){

        var result = {}
        var list = {
            className: true,
            style: true
        }

        Object.keys(props).forEach(function(name){
            // if (list[name] || name.indexOf('data-') == 0 || name.indexOf('on') === 0){
            if (list[name]){
                result[name] = props[name]
            }
        })

        return result
    },

    render: function(){

        var props = this.prepareProps(this.props, this.state)

        this.p = props

        this.data       = props.data
        this.dataSource = props.dataSource

        var header      = this.prepareHeader(props, this.state)
        var filterHeader = this.prepareFilterHeader(props, this.state)
        var wrapper     = this.prepareWrapper(props, this.state)
        var footer      = this.prepareFooter(props, this.state)
        var resizeProxy = this.prepareResizeProxy(props, this.state)

        var renderProps = this.prepareRenderProps(props)

        var menuProps = {
            columns: props.columns,
            menu   : this.state.menu
        }

        var loadMask

        if (props.loadMaskOverHeader){
            loadMask = <LoadMask visible={props.loading} />
        }

        var paginationToolbar

        if (props.pagination){
            var page    = props.page
            var minPage = props.minPage
            var maxPage = props.maxPage

            var paginationToolbarFactory = props.paginationFactory || PaginationToolbar
            var paginationProps = assign({
                dataSourceCount : props.dataSourceCount,
                page            : page,
                pageSize        : props.pageSize,
                minPage         : minPage,
                maxPage         : maxPage,
                reload          : this.reload,
                onPageChange    : this.gotoPage,
                onPageSizeChange: this.setPageSize,
                border          : props.style.border
            }, props.paginationToolbarProps)

            paginationToolbar = paginationToolbarFactory(paginationProps)

            if (paginationToolbar === undefined){
                paginationToolbar = PaginationToolbar(paginationProps)
            }
        }

        var topToolbar
        var bottomToolbar

        if (paginationToolbar){
            if (paginationToolbar.props.position == 'top'){
                topToolbar = paginationToolbar
            } else {
                bottomToolbar = paginationToolbar
            }
        }

        var leftFixTable    = this.getFixTable(props, this.state, 'left')
        var rightFixTable   = this.getFixTable(props, this.state, 'right')

        if(leftFixTable || rightFixTable) {
            this._hasFixTable = true
        }

        var result = (
            <div {...renderProps}>
                {topToolbar}
                <div className="z-inner">
                    { leftFixTable }

                    {header}
                    {filterHeader}
                    {wrapper}
                    {footer}
                    {resizeProxy}

                    { rightFixTable }
                </div>

                {loadMask}
                {renderMenu(menuProps)}
                {bottomToolbar}
            </div>
        )

        return result
    },

    /**
     * 模拟 render 方法得到左右两端渲染的 DOM
     */
    getFixTable(preparedProps, state, direct) {
        var columns = getColumnsBy(preparedProps.columns, 'fixed', direct, (col)=>{ col.toggleable = false })
        if(columns.length === 0) {
            return null
        }

        if(!state.hasHorizontalScroller) {
            return null
        }

        if(direct === 'left') {
            var lastColumn = columns[columns.length - 1]
            if(lastColumn.columns) {
                lastColumn.resizable = false
            }
        }

        var options = {
            columns: columns,
            fixed  : direct
        }

        var header          = this.prepareHeader(preparedProps, state, options)
        var filterHeader    = this.prepareFilterHeader(preparedProps, state, options)
        var wrapper         = this.prepareWrapper(preparedProps, state, options)
        var renderProps     = { ...this.prepareRenderProps(preparedProps) }

        // renderProps 的一些额外处理
        renderProps.className   = renderProps.className || ''
        renderProps.className   += ' z-fix-table z-fix-table-' + direct
        renderProps.style       = assign({}, renderProps.style || {}, {
            position: 'absolute',
            height: 'auto',
            backgroundColor: preparedProps.fixedTableBgColor || 'white'   // fix table 背景颜色
        })

        // 获取宽度，不然按照 renderProps 渲染的宽度为 所有列的宽度，会在 fix table 上出现滚动条
        renderProps.style.width = getColumnsWidth(columns)
        if(!IS_MAC) {
            renderProps.style.marginBottom = (0.855 * (preparedProps.scrollbarSize))     // 减去水平滚动条高度
        }

        // 右端固定的table, 需要展示滚动条
        if(direct === 'right') {
            renderProps.style.width += preparedProps.scrollbarSize
        }

        var result = (
            <div {...renderProps}>
                <div className='z-inner'>
                    { header }
                    { filterHeader }
                    { wrapper }
                </div>
            </div>
        )

        return result
    },

    getTableProps: function(props, state){
        var table
        var rows

        if (props.groupBy){
            rows = this.groupedRows = this.groupedRows || getGroupedRows.call(this, props, state.groupData)
            rows = slice(rows, props)
        }

        table = getTableProps.call(this, props, rows, this._subGridIsOpen)

        return table
    },

    handleVerticalScrollOverflow: function(sign, scrollTop) {

        var props = this.p
        var page  = props.page

        if (this.isValidPage(page + sign, props)){
            this.gotoPage(page + sign)
        }
    },

    fixHorizontalScrollbar: function() {
        var scroller = this.scroller

        if (scroller){
            scroller.fixHorizontalScrollbar()
        }
    },

    onWrapperMount: function(wrapper, scroller){
        this.scroller = scroller

        var preparedProps = this.p
        if(!preparedProps)
            return

        this._updateHasHorizontalScroller(scroller, preparedProps)
    },

    prepareWrapper: function(props, state, options){
        var virtualRendering = props.virtualRendering

        var data       = props.data
        var scrollTop  = state.scrollTop
        var startIndex = state.startIndex
        var endIndex   = virtualRendering?
                            this.getRenderEndIndex(props, state):
                            0

        var renderCount = virtualRendering?
                            endIndex + 1 - startIndex:
                            data.length

        var totalLength = state.groupData && state.groupData.groupsCount
            ? data.length + state.groupData.groupsCount
            : data.length

        //if (props.virtualRendering){
        //    scrollTop = startIndex * props.rowHeight
        //}

        // var topLoader
        // var bottomLoader
        // var loadersSize = 0

        // if (props.virtualPagination){

        //     if (props.page < props.maxPage){
        //         loadersSize += 2 * props.rowHeight
        //         bottomLoader = <div style={{height: 2 * props.rowHeight, position: 'relative', width: props.columnFlexCount? 'calc(100% - ' + props.scrollbarSize + ')': props.minRowWidth - props.scrollbarSize}}>
        //             <LoadMask visible={true} style={{background: 'rgba(128, 128, 128, 0.17)'}}/>
        //         </div>
        //     }

        //     if (props.page > props.minPage){
        //         loadersSize += 2 * props.rowHeight
        //         topLoader = <div style={{height: 2 * props.rowHeight, position: 'relative', width: props.columnFlexCount? 'calc(100% - ' + props.scrollbarSize + ')': props.minRowWidth - props.scrollbarSize}}>
        //             <LoadMask visible={true} style={{background: 'rgba(128, 128, 128, 0.17)'}}/>
        //         </div>
        //     }
        // }
        var verticalScrollerSize = this.getVerticalScrollerSize(props, state)

        var wrapperProps = assign({
            ref             : 'wrapper',
            onMount         : this.onWrapperMount,
            scrollLeft      : state.scrollLeft,
            scrollTop       : scrollTop,
            topOffset       : state.topOffset,
            startIndex      : startIndex,
            totalLength     : totalLength,
            verticalScrollerSize: verticalScrollerSize,
            virtualRendering: virtualRendering,
            renderCount     : renderCount,
            endIndex        : endIndex,
            renderSubGrid  : props.renderSubGrid,

            allColumns      : props.columns,

            onScrollLeft    : this.handleScrollLeft,
            onScrollTop     : this.handleScrollTop,
            onResize        : this.handleWrapperResize,
            // onScrollOverflow: props.virtualPagination? this.handleVerticalScrollOverflow: null,

            menu            : state.menu,
            menuColumn      : state.menuColumn,
            showMenu        : this.showMenu,

            // cellFactory     : props.cellFactory,
            // rowStyle        : props.rowStyle,
            // rowClassName    : props.rowClassName,
            // rowContextMenu  : props.rowContextMenu,

            // topLoader: topLoader,
            // bottomLoader: bottomLoader,
            // loadersSize: loadersSize,

            // onRowClick: this.handleRowClick,
            selected        : props.selected == null?
                state.defaultSelected:
                props.selected
        }, props)

        wrapperProps.columns    = getVisibleColumns(props, state)
        wrapperProps.hoverRowIndex = state.hoverRowIndex
        // fix Table 的相关处理
        if(options) {
            wrapperProps.ref        = 'wrapper-' + options.fixed
            wrapperProps.allColumns = options.columns
            wrapperProps.columns    = getVisibleColumns(options, state)
            wrapperProps.onMount    = emptyFn   // fix Table wrapper 没有横向滚动
            wrapperProps.onResize   = emptyFn   // fix talbe 不处理 resize
            wrapperProps.scrollLeft = 0     // 不在 水平方向滚动
            wrapperProps.fixed      = options.fixed     // 作为子组件判断是否是fix table 的依据
            wrapperProps.emptyText  = null  // 没有数据的时候， fix table 不展示 empty text
            // 不修改两个值 Row 和 Wrapper 的宽度会按照所有 column 计算的结果渲染，出现滚动条
            wrapperProps.minWidth   = wrapperProps.minRowWidth = getColumnsWidth(options.columns)
            // 左侧 fix table 不显示滚动条
            if( options.fixed === 'left' ) {
                wrapperProps.scrollbarSize = 0
            }
        }

        wrapperProps.tableProps = this.getTableProps(wrapperProps, state)
        return (props.WrapperFactory || WrapperFactory)(wrapperProps)

    },

    getVerticalScrollerSize(props, state){
        var totalLength = state.groupData && state.groupData.groupsCount
            ? props.data.length + state.groupData.groupsCount
            : props.data.length

        // calc vertical scroller size, is not compatible
        // var height = totalLength * props.rowHeight; //total data height
        var height = props.data.reduce((acc, val) => {
            var rowHeight = typeof props.rowHeight === 'number' ? props.rowHeight : props.rowHeight(val);
            return acc + rowHeight;
        }, 0);

        //sub grid height
        var id = props.idProperty, subList = state.subGridVisibleItemList;
        if (Object.keys(subList).length) {
            let visibleSubList = props.data.filter(function (item) {
                return subList.hasOwnProperty(item[id]);
            });
            height += visibleSubList.reduce((result, next) => {
                return result + (typeof props.subGridHeight === 'function' ? props.subGridHeight(next) : props.subGridHeight);
            }, 0);
        }
        
        return height
    },

    handleRowClick: function(rowProps, event){
        if (this.props.onRowClick){
            this.props.onRowClick(rowProps.data, rowProps, event)
        }
        this.handleSelection(rowProps, event)
    },

    handleGroupRowClick(groupRowProps, event){
        var groupDataList = groupRowProps.groupData.data;
        if (groupDataList && this.props.onSelectionChange && this._isMultiSelectable()) {
            var selected = assign({}, this.props.selected);//clone
            var doUnselect = false;
            groupDataList.forEach(obj=> {
                if (!doUnselect) {
                    if (this._isChecked(obj)) {
                        doUnselect = true;
                    }
                }
            })

            groupDataList.forEach(obj=> {
                var id = obj[this.props.idProperty];
                var checked = this._isChecked(obj);

                if (doUnselect) {
                    if (checked) {
                        delete selected[id]
                    }
                } else {
                    if (!checked) {
                        selected[id] = obj
                    }
                }
            })

            this.props.onSelectionChange(selected, groupDataList)
        }
    },

    _handleRowMouseEnter(event, index) {
        if(! this._hasFixTable) {
            if(this.state.hoverRowIndex != null) {
                this.setState({
                    hoverRowIndex: null
                })
            }
            return
        }

        this.setState({
            hoverRowIndex: index
        })
    },

    _handleRowMouseLeave(event, index) {
        if(! this._hasFixTable || this.state.hoverRowIndex == null) {
            return
        }

        this.setState({
            hoverRowIndex: null
        })
    },

    _getSelected(){
        return this.props.selected;
    },
    _isChecked(obj){
        var id = obj[this.props.idProperty],
            selected = this._getSelected();

        return selected.hasOwnProperty(id);
    },
    _isMultiSelectable(){
        return this.props.selected && typeof (this.props.selected) == 'object';
    },

    prepareProps: function(thisProps, state){
        var props = assign({}, thisProps)

        props.subGridVisibleItemList = state.subGridVisibleItemList

        this.prepareColumns(props, state)

        props.loading    = this.prepareLoading(props)
        props.data       = this.prepareData(props)
        props.dataSource = this.prepareDataSource(props)
        props.empty      = !props.data.length

        props.virtualRendering = this.isVirtualRendering(props)
        if(props.virtualRendering){
            props.rowHeight = props.rowHeight || state.rowHeight || 31
            props.subGridHeight = props.subGridHeight || 200
        }
        props.scrollbarSize = props.virtualRendering ? props.scrollbarSize : 0;

        props.filterable = this.prepareFilterable(props)
        props.resizableColumns = this.prepareResizableColumns(props)
        props.reorderColumns = this.prepareReorderColumns(props)

        this.prepareClassName(props, state)
        props.style = this.prepareStyle(props)

        this.preparePaging(props, state)

        props.minRowWidth = props.totalColumnWidth + props.scrollbarSize

        // 添加 row hover 的处理props
        props.onRowMouseLeave = this._handleRowMouseLeave
        props.onRowMouseEnter = this._handleRowMouseEnter

        return props
    },

    prepareLoading: function(props) {
        var showLoadMask = props.showLoadMask || !this.isMounted() //ismounted check for initial load
        return props.loading == null? showLoadMask && this.state.defaultLoading: props.loading
    },

    preparePaging: function(props, state) {
        props.pagination = this.preparePagination(props)

        if (props.pagination){
            props.pageSize = this.preparePageSize(props)
            props.dataSourceCount = this.prepareDataSourceCount(props)

            props.minPage = 1
            props.maxPage = Math.ceil((props.dataSourceCount || 1) / props.pageSize)
            props.page    = clamp(this.preparePage(props), props.minPage, props.maxPage)
        }
    },

    preparePagination: function(props) {
        return props.pagination === false?
                false:
                !!props.pageSize || !!props.paginationFactory || this.isRemoteDataSource(props)
    },

    prepareDataSourceCount: function(props) {
        return props.dataSourceCount == null? this.state.defaultDataSourceCount: props.dataSourceCount
    },

    preparePageSize: function(props) {
        return props.pageSize == null? this.state.defaultPageSize: props.pageSize
    },

    preparePage: function(props) {
        return props.page == null?
            this.state.defaultPage:
            props.page
    },
    /**
     * Returns true if in the current configuration,
     * the datagrid should load its data remotely.
     *
     * @param  {Object}  [props] Optional. If not given, this.props will be used
     * @return {Boolean}
     */
    isRemoteDataSource: function(props) {
        props = props || this.props

        return props.dataSource && !isArray(props.dataSource)
    },

    prepareDataSource: function(props) {
        var dataSource = props.dataSource

        if (isArray(dataSource)){
            dataSource = null
        }

        return dataSource
    },

    prepareData: function(props) {

        var data = null

        if (isArray(props.data)){
            data = props.data
        }

        if (isArray(props.dataSource)){
            data = props.dataSource
        }

        data = data == null? this.state.defaultData: data

        if (!isArray(data)){
            data = []
        }

        //存在原始过滤器，跳过自动过滤
        let onFilter = this.props.onFilter;
        if (props.filterable && !onFilter) {
            let columnFilterMap = this.state.columnFilterMap;
            data = this._filterData(data, props.columns, columnFilterMap);
        }

        return data;
    },

    /**
     * 过滤数据
     * @param rawData
     * @param columns
     * @param columnFilterMap
     * @returns {*}
     * @private
     */
    _filterData(rawData, columns, columnFilterMap){
        // 取得非服务端过滤项
        let filterColumns = columns.filter((column) => !column.searchable && columnFilterMap.hasOwnProperty(column.name));
        if (filterColumns.length == 0)
            return rawData;

        // 默认过滤器
        return rawData.filter(dataItem=> {
            // all filter pass to show
            return filterColumns.every((column)=> {
                let args = [dataItem, columnFilterMap[column.name], columnFilterMap]

                if (column.dataFilter) {
                    return column.dataFilter(...args);
                } else {
                    return this._defaultDataFilter(column, ...args)
                }
            })
        })
    },

    _defaultDataFilter(column, dataItem, columnFilterTxt){
        let text = dataItem[column.name];
        text = column.render ?
            column.render(text, dataItem, null, null, this) :
            text;

        let type = typeof (text);
        switch (type) {
            case 'undefined':
            case 'object':
                return false;
            case 'string':
                text = text.toLowerCase();
                break;
            default:
                text = text.toString();
                break;
        }

        let sTxt = columnFilterTxt.toString().toLowerCase();
        return text.indexOf(sTxt) > -1
    },

    prepareFilterable: function(props) {
        return props.filterable !== false;

        // if (props.filterable === false){
        //     return false
        // }
        //
        // return props.filterable || !!props.onFilter
    },

    prepareResizableColumns: function(props) {
        if (props.resizableColumns === false){
            return false
        }

        return props.resizableColumns || !!props.onColumnResize
    },

    prepareReorderColumns: function(props) {
        if (props.reorderColumns === false){
            return false
        }

        return props.reorderColumns || !!props.onColumnOrderChange
    },

    isVirtualRendering: function(props){
        props = props || this.props

        //return props.virtualRendering || (props.rowHeight != null)
        return !!props.virtualRendering
    },

    groupData: function(props){
        if (props.groupBy){
            var data = this.prepareData(props)

            this.setState({
                groupData: group(data, props.groupBy)
            })

            delete this.groupedRows
        }
    },

    isValidPage: function(page, props) {
        return page >= 1 && page <= this.getMaxPage(props)
    },

    getMaxPage: function(props) {
        props = props || this.props

        var count    = this.prepareDataSourceCount(props) || 1
        var pageSize = this.preparePageSize(props)

        return Math.ceil(count / pageSize)
    },

    reload: function (isGoScrollTop) {
        if (this.dataSource) {
            return this.loadDataSource(this.dataSource, this.props, isGoScrollTop)
        }
    },

    clampPage: function(page) {
        return clamp(page, 1, this.getMaxPage(this.props))
    },

    setPageSize: function(pageSize) {

        var stateful
        var newPage = this.preparePage(this.props)
        var newState = {}

        if (typeof this.props.onPageSizeChange == 'function'){
            this.props.onPageSizeChange(pageSize, this.p)
        }

        if (this.props.pageSize == null){
            stateful = true
            this.state.defaultPageSize = pageSize
            newState.defaultPageSize = pageSize
        }

        if (!this.isValidPage(newPage, this.props)){

            newPage = this.clampPage(newPage)

            if (typeof this.props.onPageChange == 'function'){
                this.props.onPageChange(newPage)
            }

            if (this.props.page == null){
                stateful = true
                this.state.defaultPage = newPage
                newState.defaultPage   = newPage
            }
        }

        if (stateful){
            this.reload(true)
            this.setState(newState)
        }
    },

    gotoPage: function(page) {
        if (typeof this.props.onPageChange == 'function'){
            this.props.onPageChange(page)
        } else {
            this.state.defaultPage = page
            var result = this.reload(true)
            this.setState({
                defaultPage: page
            })

            return result
        }
    },

    goScrollTop(scrollTop){
        if (this._isUnmounted) {
            return;
        }
        var bars = ReactDOM.findDOMNode(this).querySelectorAll(this.isVirtualRendering() ? '.ref-verticalScrollbar' : '.z-un-virtual-rendering');
        bars[bars.length - 1].scrollTop = scrollTop || 0;
    },

    goScrollByRowIndex(rowIndex, props){
        props = props || this.prepareProps(this.props, this.state);
        // when use function rowHeight, it wont' be right position
        var calcHeight = 0;
        for (var i = 0; i < rowIndex; i++) {
            calcHeight += typeof props.rowHeight === 'number' ? props.rowHeight : props.rowHeight(props.data[i]);
        }
        var scrollTop = calcHeight;
        this.goScrollTop(scrollTop);
    },

    goScrollByItemId(id, props){
        var state = this.state;
        props = props || this.prepareProps(this.props, this.state);

        if (state.groupData) {
            let index = getIndexForGroupById(state.groupData, props.idProperty, id);
            if (index > -1)
                this.goScrollByRowIndex(index)
        } else {
            for (let i = 0, lg = props.data.length; i < lg; i++) {
                let item = props.data[i];
                if (item[props.idProperty] === id) {
                    this.goScrollByRowIndex(i)
                    break;
                }
            }
        }
    },

    /**
     * Loads remote data
     *
     * @param  {String/Function/Promise} [dataSource]
     * @param  {Object} [props]
     * @param  {Boolean} [isGoScrollTop]
     */
    loadDataSource: function(dataSource, props, isGoScrollTop) {
        props = props || this.props

        if (!arguments.length){
            dataSource = props.dataSource
        }

        var dataSourceQuery = {}

        if (props.sortInfo){
            dataSourceQuery.sortInfo = props.sortInfo
        }

        var pagination = this.preparePagination(props)
        var pageSize
        var page

        if (pagination){
            pageSize = this.preparePageSize(props)
            page     = this.preparePage(props)

            // 合并自定义搜索参数
            assign(dataSourceQuery, this.state.dataSourceQuery, {
                pageSize: pageSize,
                page    : page,
                skip    : (page - 1) * pageSize
            })
        }

        if (typeof dataSource == 'function'){
            dataSource = dataSource(dataSourceQuery, props)
        }

        if (typeof dataSource == 'string'){
            var fetch = this.props.fetch || global.fetch

            var keys = Object.keys(dataSourceQuery)
            if (props.appendDataSourceQueryParams && keys.length){
                //dataSource was initially passed as a string
                //so we append quey params
                dataSource += '?' + keys.map(function(param){
                    return param + '=' + JSON.stringify(dataSourceQuery[param])
                }).join('&')
            }

            dataSource = fetch(dataSource)
        }

        if (dataSource && dataSource.then){

            if (props.onDataSourceResponse){
                dataSource.then(props.onDataSourceResponse, props.onDataSourceResponse)
            } else {
                this.setState({
                    defaultLoading: true
                })

                var errorFn = function(err){
                    if (this._isUnmounted) {
                        return;
                    }
                    if (props.onDataSourceError){
                        props.onDataSourceError(err)
                    }

                    this.setState({
                        defaultLoading: false
                    })
                }.bind(this)

                var noCatchFn = dataSource['catch']? null: errorFn

                dataSource = dataSource
                    .then(function(response){
                        return response && typeof response.json == 'function'?
                                    response.json():
                                    response
                    })
                    .then(function(json){
                        if (this._isUnmounted) {
                            return;
                        }
                        if (props.onDataSourceSuccess){
                            props.onDataSourceSuccess(json)
                            this.setState({
                                defaultLoading: false
                            })
                            return
                        }

                        var info
                        if (typeof props.getDataSourceInfo == 'function'){
                            info = props.getDataSourceInfo(json)
                        }

                        var data = info?
                            info.data:
                            Array.isArray(json)?
                                json:
                                json.data

                        var count = info?
                            info.count:
                            json.count != null?
                                json.count:
                                null


                        var newState = {
                            defaultData: data,
                            defaultLoading: false
                        }
                        if (props.groupBy){
                            newState.groupData = group(data, props.groupBy)
                            delete this.groupedRows
                        }

                        if (count != null){
                            newState.defaultDataSourceCount = count
                        }

                        this.setState(newState, function () {
                            if (isGoScrollTop) {
                                this.goScrollTop();
                            } else {
                                this._resetPerformanceCacheForScrollTop();
                            }
                        }.bind(this))
                    }.bind(this), noCatchFn)

                if (dataSource['catch']){
                    dataSource['catch'](errorFn)
                }
            }

            if (props.onDataSourceLoaded){
                dataSource.then(props.onDataSourceLoaded)
            }
        }

        return dataSource
    },

    componentWillMount: function(){
        this.rowCache = {}
        this.groupData(this.props)
        this._resetPerformanceCacheForScrollTop();

        if (this.isRemoteDataSource(this.props)){
            this.loadDataSource(this.props.dataSource, this.props)
        }
    },

    componentWillReceiveProps: function(nextProps){
        this.rowCache = {}
        this.groupData(nextProps)

        if (isArray(nextProps.dataSource) || isArray(nextProps.data)) {
            this._resetPerformanceCacheForScrollTop();
        }

        if (this._equalSubGridVisibleItemList(this.state.subGridVisibleItemList, nextProps.expandedSubGridList || {})) {
            this._resetPerformanceCacheForScrollTop();
            this.setState({
                subGridVisibleItemList: {
                    ...nextProps.expandedSubGridList,
                },
            });
            // this.forceUpdate();
        }

        if (this.isRemoteDataSource(nextProps)){
            var otherPage     = this.props.page != nextProps.page
            var otherPageSize = this.props.pageSize != nextProps.pageSize

            if (nextProps.reload || otherPage || otherPageSize){
                this.loadDataSource(nextProps.dataSource, nextProps)
            }
        }
    },

    _equalSubGridVisibleItemList(one, next) {
        return Object.keys(one).length !== Object.keys(next).length;
    },

    prepareStyle: function(props){
        var style = {}

        assign(style, props.defaultStyle, props.style)

        return style
    },

    prepareClassName: function(props, state){
        props.className = props.className || ''
        props.className += ' ' + props.defaultClassName

        if (props.cellEllipsis){
            props.className += ' ' + props.cellEllipsisCls
        }

        if (props.styleAlternateRows){
            props.className += ' ' + props.styleAlternateRowsCls
        }

        if (props.showCellBorders){
            var cellBordersCls = props.showCellBorders === true?
            props.showCellBordersCls + '-horizontal ' + props.showCellBordersCls + '-vertical':
            props.showCellBordersCls + '-' + props.showCellBorders

            props.className += ' ' + cellBordersCls

        }

        if (props.withColumnMenu){
            props.className += ' ' + props.withColumnMenuCls
        }

        if (props.empty){
            props.className += ' ' + props.emptyCls
        }

        if(state.hasHorizontalScroller) {
            var scrollPositionCls = 'z-scroll-position-left'
            if(this.state.scrollPosition) {
                scrollPositionCls = 'z-scroll-position-' + this.state.scrollPosition
            }
            props.className += ' ' + scrollPositionCls
        }
    },

    ///////////////////////////////////////
    ///
    /// Code dealing with preparing columns
    ///
    ///////////////////////////////////////
    prepareColumns: function(props, state){
        //insert sub grid toggle
        if (this.isSubGridRender(props) && !this.props.expandedSubGridList) {
            props.columns = [{
                name: '__subGridToggle',
                title: ' ',
                width: 40,
                render: this._subGridToggleRender
            }].concat(props.columns);
        }

        //fill
        props.columns = props.columns.map(function(col, index){
            col = Column(col, props)
            col.index = index
            if (col.columns) {
                this.prepareSubColumns(props, state, col);
            }
            return col
        }, this)

        this.prepareColumnSizes(props, state)

        props.columns.forEach(this.prepareColumnStyle.bind(this, props))

    },

    prepareSubColumns(props, state, column){
        //fill
        column.columns = column.columns.map(function (col, index) {
            col = Column(col, props)
            col.index = index
            col.resizable = false
            if (col.columns) {
                this.prepareSubColumns(props, state, col);
            }
            return col
        }, this)

        this.prepareColumnSizes(props, state)

        column.columns.forEach(this.prepareColumnStyle.bind(this, props))
    },

    isSubGridRender(props){
        props = props || this.props
        return !!props.renderSubGrid
    },

    _subGridToggleRender(empty, obj){
        var subIcon = this._subGridIsOpen(obj) ? 'z-sub-icon z-sub-icon-minus' : 'z-sub-icon z-sub-icon-plus';
        return (
            <span className={subIcon} onClick={this._subGridToggle.bind(this, obj)}/>
        );
    },
    _subGridIsOpen(obj){
        if (!obj) {
            return false
        }
        var key = obj[this.props.idProperty]
        return this.state.subGridVisibleItemList.hasOwnProperty(key);
    },
    _subGridToggle(obj, e){
        e.stopPropagation();
        var key = obj[this.props.idProperty]
        var list = this.state.subGridVisibleItemList;
        if (list.hasOwnProperty(key)) {
            delete list[key];
        } else {
            list[key] = obj;
        }
        this._resetPerformanceCacheForScrollTop();
        this.forceUpdate();
    },

    prepareColumnStyle: function(props, column){
        var style = column.sizeStyle = {}

        column.style     = assign({}, column.style)
        column.textAlign = column.textAlign || column.style.textAlign

        var minWidth = column.minWidth || props.columnMinWidth

        style.minWidth = minWidth

        if (column.flexible){
            style.flex = column.flex || 1
        } else {
            style.width    = column.width
            style.minWidth = column.width
        }
    },

    prepareColumnSizes: function(props, state){

        var visibleColumns = getVisibleColumns(props, state)
        var totalWidth     = 0
        var flexCount      = 0

        visibleColumns.forEach(function(column){
            column.minWidth = column.minWidth || props.columnMinWidth

            if (!column.flexible){
                totalWidth += column.width
                return 0
            } else if (column.minWidth){
                totalWidth += column.minWidth
            }

            flexCount++
        }, this)

        props.columnFlexCount  = flexCount
        props.totalColumnWidth = totalWidth
    },

    prepareResizeProxy: function(props, state){
        return <ResizeProxy ref="resizeProxy" active={state.resizing}/>
    },

    onColumnResizeDragStart: function(config){
        if (this._isUnmounted) {
            return;
        }
        var domNode = ReactDOM.findDOMNode(this)
        var region  = Region.from(domNode)

        this.resizeProxyLeft = config.resizeProxyLeft - region.left

        this.setState({
            resizing: true,
            resizeOffset: this.resizeProxyLeft
        })

    },

    onColumnResizeDrag: function(config){
        this.refs.resizeProxy.setState({
            offset: this.resizeProxyLeft + config.resizeProxyDiff
        })
    },

    onColumnResizeDrop: function(config, resizeInfo){

        var horizScrollbar = this.refs.wrapper.refs.horizScrollbar

        if (horizScrollbar && this.state.scrollLeft){

            setTimeout(function(){
                //FF needs this, since it does not trigger scroll event when scrollbar dissapears
                //so we might end up with grid content not visible (to the left)
                if (this._isUnmounted) {
                    return;
                }
                var domNode = ReactDOM.findDOMNode(horizScrollbar)
                if (domNode && !domNode.scrollLeft){
                    this.handleScrollLeft(0, null)
                }
            }.bind(this), 1)

        }

        var props   = this.props
        var columns = props.columns

        var onColumnResize = props.onColumnResize || emptyFn
        var first = resizeInfo[0]

        var firstCol  = findColumn(columns, first.name)
        var firstSize = first.size

        var second = resizeInfo[1]
        var secondCol = second? findColumn(columns, second.name): undefined
        var secondSize = second? second.size: undefined

        //if defaultWidth specified, update it
        if (firstCol.width == null && firstCol.defaultWidth){
            firstCol.defaultWidth = firstSize
        }

        if (secondCol && secondCol.width == null && secondCol.defaultWidth){
            secondCol.defaultWidth = secondSize
        }

        this.setState(config)

        onColumnResize(firstCol, firstSize, secondCol, secondSize)

        this._updateHasHorizontalScroller()
    },

    /**
     * 根据 scroller 和 props 更新是否有横向滚动条的方法
     * @param scroller
     * @param props
     */
    _updateHasHorizontalScroller(scroller, props) {
        scroller = scroller || this.scroller
        props    = props || this.p

        if(!scroller || !props) {
            return
        }

        if(this._updateHasHorizontalScroller.pending) {
            clearTimeout(this._updateHasHorizontalScroller.pending)
        } else {
            this._updateHasHorizontalScroller.pending = setTimeout(()=>{
                if (this._isUnmounted) {
                    return;
                }
                var scrollWidth = ReactDOM.findDOMNode(scroller).getBoundingClientRect().width
                var hasHorizontalScroller = scrollWidth <= props.minRowWidth
                if(hasHorizontalScroller !== this.state.hasHorizontalScroller) {
                    this.setState({
                        hasHorizontalScroller: hasHorizontalScroller
                    })
                }
                this._updateHasHorizontalScroller.pending = undefined
            }, 300)
        }
    }
})
