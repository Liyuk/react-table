'use strict'

import Component from 'react-class'

const React      = require('react')
var ReactDOM = require('react-dom');
const LoadMask   = require('react-load-mask')
const assign     = require('object-assign')
const DragHelper = require('drag-helper')
const normalize  = require('react-style-normalizer')
const hasTouch   = require('has-touch')
const classes    = require('classnames')

const preventDefault = event => event && event.preventDefault()
const signum         = x     => x < 0? -1: 1
const emptyFn        = ()    => {}
const ABS            = Math.abs

const LoadMaskFactory = React.createFactory(LoadMask)

var horizontalScrollbarStyle = {}

var IS_MAC     = global && global.navigator && global.navigator.appVersion && global.navigator.appVersion.indexOf("Mac") != -1
var IS_FIREFOX = global && global.navigator && global.navigator.userAgent && !!~global.navigator.userAgent.toLowerCase().indexOf('firefox')

var CUR_SCROLLER
const setScroller = function(scroller){
	if(CUR_SCROLLER !== scroller) {
        CUR_SCROLLER = scroller
	}
}
const getScroller = function() {
	return CUR_SCROLLER
}
const CUR_SCROLLER_STORE = {
	getScroller,
	setScroller
}

if (IS_MAC){
    horizontalScrollbarStyle.position = 'absolute'
	horizontalScrollbarStyle.height   = 20
}

var ADD_EVENT
var REMOVE_EVENT
(function(){
    if(global.addEventListener) {
        ADD_EVENT = function(dom, type, handler){
            dom.addEventListener(type, handler)
        }
        REMOVE_EVENT = function(dom, type, handler) {
            dom.removeEventListener(type, handler)
        }
    } else if(global.attachEvent) {
        ADD_EVENT = function(dom, type, handler) {
            dom.attachEvent(type, handler)
        }
        REMOVE_EVENT = function(dom, type, handler) {
            dom.detachEvent(type, handler)
        }
    } else {
        ADD_EVENT = function(dom, type, handler, context) {
            dom['on' + type] = function() {
                handler.apply(context, Array.prototype.slice.apply(arguments))
            }
        }
        REMOVE_EVENT = function(dom, type) {
                delete dom['on' + type]
        }
    }
})()

const PT = React.PropTypes
const DISPLAY_NAME = 'Scroller'

const ON_OVERFLOW_NAMES = {
	vertical  : 'onVerticalScrollOverflow',
	horizontal: 'onHorizontalScrollOverflow'
}

const ON_SCROLL_NAMES = {
	vertical  : 'onVerticalScroll',
	horizontal: 'onHorizontalScroll'
}

/**
 * Called on scroll by mouse wheel
 */
const syncScrollbar = function(orientation) {

	return function(scrollPos, event){
        if (!this.props.virtualRendering && orientation != 'horizontal') {
            //onVerticalScroll use default
            return;
        }

		var domNode       = orientation == 'horizontal'? this.getHorizontalScrollbarNode(): this.getVerticalScrollbarNode()
		var scrollPosName = orientation == 'horizontal'? 'scrollLeft': 'scrollTop'
		var overflowCallback

		domNode[scrollPosName] = scrollPos

		var newScrollPos = domNode[scrollPosName]

		if (newScrollPos != scrollPos){
			// overflowCallback = this.props[ON_OVERFLOW_NAMES[orientation]]
			// overflowCallback && overflowCallback(signum(scrollPos), newScrollPos)
		} else {
            if(event) {
                event.stopPropagation()
                preventDefault(event)
            }
		}
	}
}

const syncHorizontalScrollbar = syncScrollbar('horizontal')
const syncVerticalScrollbar   = syncScrollbar('vertical')

const scrollAt = function(orientation){
	var syncFn = orientation == 'horizontal'?
					syncHorizontalScrollbar:
					syncVerticalScrollbar

	return function(scrollPos, event){
	    // this.mouseWheelScroll = true

	    syncFn.call(this, Math.round(scrollPos), event)

	    // raf(function(){
	    //     this.mouseWheelScroll = false
	    // }.bind(this))
	}
}

const onScroll = function(orientation){

	var clientHeightNames = {
		vertical  : 'clientHeight',
		horizontal: 'clientWidth'
	}

	var scrollHeightNames = {
		vertical  : 'scrollHeight',
		horizontal: 'scrollWidth'
	}

	return function(event){

		var scrollPosName = orientation == 'horizontal'? 'scrollLeft': 'scrollTop'
		var target        = event.target
		var scrollPos     = target[scrollPosName]

		var onScroll   = this.props[ON_SCROLL_NAMES[orientation]]
		var onOverflow = this.props[ON_OVERFLOW_NAMES[orientation]]

		var curScroller = CUR_SCROLLER_STORE.getScroller()
        if(! curScroller) {
            curScroller = this
			CUR_SCROLLER_STORE.setScroller(this)
        }

        if(this !== curScroller) {
            return
        }

	    // if (!this.mouseWheelScroll && onOverflow){
	    if (onOverflow){
	        if (scrollPos == 0){
	        	onOverflow(-1, scrollPos)
	        } else if (scrollPos + target[clientHeightNames[orientation]] >= target[scrollHeightNames[orientation]]){
	        	onOverflow(1, scrollPos)
	        }
	    }

	    ;(onScroll || emptyFn)(scrollPos, event)
	}
}

/**
 * The scroller can have a load mask (loadMask prop is true by default),
 * you just need to specify loading=true to see it in action
 *
 * <Scroller loading={true} />
 *
 * If you don't want a load mask, specify
 *
 * <Scroller loadMask={false} />
 *
 * Or if you want to customize the loadMask factory, specify
 *
 * function mask(props) { return aMaskFactory(props) }
 * <Scroller loading={true} loadMask={mask}
 *
 */
class Scroller extends Component {

	render(){
		var props = this.p = this.prepareProps(this.props)

		var loadMask            = this.renderLoadMask(props)
		var horizontalScrollbar = this.renderHorizontalScrollbar(props)
		var verticalScrollbar   = this.renderVerticalScrollbar(props)

		var events = {}

		if (!hasTouch){
		    events.onWheel = this.handleWheel
		} else {
		    events.onTouchStart = this.handleTouchStart
            events.onTouchMove=this.handleTouchMove
		}

		//extra div needed for SAFARI V SCROLL
        //maxWidth needed for FF - see
        //http://stackoverflow.com/questions/27424831/firefox-flexbox-overflow
        //http://stackoverflow.com/questions/27472595/firefox-34-ignoring-max-width-for-flexbox
        var ctxClassName = classes({"z-content-wrapper-fix": true, "z-un-virtual-rendering": !props.virtualRendering});
		var content = <div className={ctxClassName} style={{maxWidth: 'calc(100% - ' + props.scrollbarSize + 'px)'}}
						children={props.children} />

		var renderProps = this.prepareRenderProps(props)
		return <div {...renderProps}
                    onTouchStart={CUR_SCROLLER_STORE.setScroller.bind(null, this)}
                    onMouseOver={CUR_SCROLLER_STORE.setScroller.bind(null, this)} >
			{loadMask}
			<div className="z-content-wrapper" {...events}>
				{content}
				{verticalScrollbar}
			</div>

			{horizontalScrollbar}
		</div>
	}

	prepareRenderProps(props) {
		var renderProps = assign({}, props)

		delete renderProps.height
		delete renderProps.width

		return renderProps
	}

	handleTouchStart(event) {
		var props  = this.props
		var scroll = {
	        top : props.scrollTop,
	        left: props.scrollLeft
	    }

	    var newScrollPos
	    var side

	    DragHelper(event, {
	        scope: this,
	        onDrag: function(event, config) {
	            if (config.diff.top == 0 && config.diff.left == 0){
	                return
	            }

	            if (!side){
	                side = ABS(config.diff.top) > ABS(config.diff.left)? 'top': 'left'
	            }

	            var diff = config.diff[side]

	            newScrollPos = scroll[side] - diff

	            if (side == 'top'){
	                this.verticalScrollAt(newScrollPos, event)
	            } else {
	                this.horizontalScrollAt(newScrollPos, event)
	            }

	        }
	    })
	    event.stopPropagation()
	}

    handleTouchMove(event) {
        preventDefault(event)
    }

    handleWheel(event) {
        if (event.deltaY == 0 && event.deltaX == 0)
            return;

		var props           = this.props
		// var normalizedEvent = normalizeWheel(event)

		var horizontal, delta;
		var virtual    = props.virtualRendering
		var scrollStep = props.scrollStep
		var minScrollStep = props.minScrollStep

		var scrollTop  = props.scrollTop
		var scrollLeft = props.scrollLeft

		// var delta = normalizedEvent.pixelY
		if (event.shiftKey) {
			horizontal = true;
			delta = event.deltaY || event.deltaX;
			// delta = delta || normalizedEvent.pixelX
		} else {
			horizontal = ABS(event.deltaX) > ABS(event.deltaY);
			delta = horizontal ? event.deltaX : event.deltaY;
		}

		if (horizontal){
			minScrollStep = props.minHorizontalScrollStep || minScrollStep
		} else {
			minScrollStep = props.minVerticalScrollStep   || minScrollStep
		}

		if (typeof props.interceptWheelScroll == 'function'){
			delta = props.interceptWheelScroll(delta, normalizedEvent, event)
		} else if (minScrollStep){
			if (ABS(delta) < minScrollStep){
				delta = signum(delta) * minScrollStep
			}
		}

	    if (horizontal){
	    	this.horizontalScrollAt(scrollLeft + delta, event)

            // shift 情况下组织默认事件
            if (event.shiftKey || props.preventDefaultHorizontal) {
                preventDefault(event)
            }
	    } else {
		    this.verticalScrollAt(scrollTop + delta, event)

		    props.preventDefaultVertical && preventDefault(event)
		}
	}

    handleWindowResize() {
        if(this.handleWindowResize.pending) {
            clearTimeout(this.handleWindowResize.pending)
        }
        this.handleWindowResize.pending = setTimeout(()=>{
            this.props.onResize && this.props.onResize()
            this.handleWindowResize.pending = undefined
        }, 300)
    }

	componentWillReceiveProps() {
        this.setTimer()
	}

	componentDidMount() {
		this.fixHorizontalScrollbar()
		;(this.props.onMount || emptyFn)(this)

        ADD_EVENT(global, 'resize', this.handleWindowResize, this)

        this.setTimer()
	}

    setTimer() {
        setTimeout(this.fixHorizontalScrollbar, 0)
    }

	fixHorizontalScrollbar() {
        if (this._isUnmounted)
            return

        this.horizontalScrollerNode = this.horizontalScrollerNode || this.querySelector('.z-horizontal-scroller')

		var dom = this.horizontalScrollerNode

		if (dom){
			var height = dom.style.height

            dom.style.height = height == '0.7px' ? '0.6px' : '0.7px';
        }
	}

	getVerticalScrollbarNode(){
		return this.verticalScrollbarNode = this.verticalScrollbarNode || this.querySelector('.ref-verticalScrollbar');
	}

	getHorizontalScrollbarNode(){
		return this.horizontalScrollbarNode = this.horizontalScrollbarNode || this.querySelector('.ref-horizontalScrollbar')
	}

    querySelector(selector){
        var temp = ReactDOM.findDOMNode(this).querySelectorAll(selector);
        return temp[temp.length - 1];
    }

	componentWillUnmount(){
        REMOVE_EVENT(global, 'resize', this.handleWindowResize)
        this._isUnmounted = true;
		delete this.horizontalScrollerNode
		delete this.horizontalScrollbarNode
        delete this.verticalScrollbarNode
    }

	////////////////////////////////////////////////
	//
	// RENDER METHODS
	//
	////////////////////////////////////////////////
	renderVerticalScrollbar(props) {
		var height = props.scrollHeight
		var verticalScrollbarStyle = {
			width: props.scrollbarSize
		}

		var onScroll = this.onVerticalScroll

		return <div className="z-vertical-scrollbar" style={verticalScrollbarStyle}>
		    <div
		    	className="ref-verticalScrollbar"
		    	onScroll={onScroll}
		    	style={{overflow: 'auto', width: '100%', height: '100%'}}
		    >
		        <div className="z-vertical-scroller" style={{height: height}} />
		    </div>
		</div>
	}

	renderHorizontalScrollbar(props) {
		var scrollbar
		var onScroll = this.onHorizontalScroll
		var style    = horizontalScrollbarStyle
		var minWidth = props.scrollWidth

		var scroller = <div xref="horizontalScroller" className="z-horizontal-scroller" style={{width: minWidth}} />

		if (IS_MAC){
		    //needed for mac safari
		    scrollbar = <div
		    			style={style}
		    			className="z-horizontal-scrollbar mac-fix"
		    		>
				        <div
				        	onScroll={onScroll}
				        	className="ref-horizontalScrollbar z-horizontal-scrollbar-fix"
				        >
				            {scroller}
				        </div>
		    		</div>
		} else {
		    scrollbar = <div
		    		style={style}
		    		className="ref-horizontalScrollbar z-horizontal-scrollbar"
		    		onScroll={onScroll}
		    	>
		        {scroller}
		    </div>
		}

		return scrollbar
	}

	renderLoadMask(props) {
		if (props.loadMask){
			var loadMaskProps = assign({ visible: props.loading }, props.loadMaskProps)

			var defaultFactory = LoadMaskFactory
			var factory = typeof props.loadMask == 'function'?
							props.loadMask:
							defaultFactory

			var mask = factory(loadMaskProps)

			if (mask === undefined){
				//allow the specified factory to just modify props
				//and then leave the rendering to the defaultFactory
				mask = defaultFactory(loadMaskProps)
			}

			return mask
		}
	}

	////////////////////////////////////////////////
	//
	// PREPARE PROPS METHODS
	//
	////////////////////////////////////////////////
	prepareProps(thisProps) {
		const props = assign({}, thisProps)

		props.className = this.prepareClassName(props)
		props.style     = this.prepareStyle(props)

		return props
	}

	prepareStyle(props) {
		let style = assign({}, props.style)

		if (props.height != null){
			style.height = props.height
		}

		if (props.width != null){
			style.width = props.width
		}

		if (props.normalizeStyles){
			style = normalize(style)
		}

		return style
	}

	prepareClassName(props) {
		let className = props.className || ''

		if (Scroller.className){
			className += ' ' + Scroller.className
		}

		return className
	}
}

Scroller.className = 'z-scroller'
Scroller.displayName = DISPLAY_NAME

assign(Scroller.prototype, {
	onVerticalScroll: onScroll('vertical'),
	onHorizontalScroll: onScroll('horizontal'),

	verticalScrollAt  : scrollAt('vertical'),
	horizontalScrollAt: scrollAt('horizontal'),

	syncHorizontalScrollbar: syncHorizontalScrollbar,
	syncVerticalScrollbar  : syncVerticalScrollbar
})

Scroller.propTypes = {
	loadMask: PT.oneOfType([
		PT.bool,
		PT.func
	]),

	loading : PT.bool,
	normalizeStyles: PT.bool,

	scrollTop : PT.number,
	scrollLeft: PT.number,

	scrollWidth : PT.number.isRequired,
	scrollHeight: PT.number.isRequired,

	height: PT.number,
	width : PT.number,

	minScrollStep          : PT.number,
	minHorizontalScrollStep: PT.number,
	minVerticalScrollStep  : PT.number,

    virtualRendering: PT.oneOf([true, false]),

	preventDefaultVertical: PT.bool,
	preventDefaultHorizontal: PT.bool
},

Scroller.defaultProps = {
	'data-display-name': DISPLAY_NAME,
	loadMask: true,

	virtualRendering: true, //FOR NOW, only true is supported
	scrollbarSize: 20,

	scrollTop : 0,
	scrollLeft: 0,

	minScrollStep: 10,

	minHorizontalScrollStep: IS_FIREFOX? 40: 1,

	//since FF goes back in browser history on scroll too soon
	//chrome and others also do this, but the normal preventDefault in syncScrollbar fn prevents this
	preventDefaultHorizontal: IS_FIREFOX
}

export default Scroller
