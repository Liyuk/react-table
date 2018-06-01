/*  header-comment
/*  file   : index
/*  title  : 基于react-datagrid扩展的table基础组件
/*  author : likun
/*  date   : 2017-5-2 10:59:37
/*  last   : 2017-6-4 18:35:23
*/
import React, { Component } from 'react';
import { Checkbox, Pagination, Radio } from 'antd';

// react-datagrid
import DataGrid from './react-datagrid/';
// import './react-datagrid/style/index-no-normalize.css';

const void0 = function () {};

function pageChunk(data, size, page) {
	// 当给的数据比每页数量少的时候，应当是受控的分页功能
	if (data.length <= size) {
		return data;
	}
	const result = [];
	for (let i = 0; i < data.length; i += size) {
		result.push(data.slice(i, i + size));
	}
	return result[page - 1];
}

class Table extends Component {
	constructor(props) {
		super(props);

		const { pagination } = props;
		this.state = {
			selected: {},
			current: pagination ? (pagination.defaultCurrent || pagination.current || 1) : 1,
			pageSize: pagination ? (pagination.defaultPageSize || pagination.pageSize || 10) : 10,
			gridProps: {
				dataSource: [],
			},
		};

		this.initSelection = this.initSelection.bind(this);
		this.clearReactDataGridProps = this.clearReactDataGridProps.bind(this);
		this.onSelectionChange = this.onSelectionChange.bind(this);
		this.onPaginationChange = this.onPaginationChange.bind(this);
		this.onPaginationShowSizeChange = this.onPaginationShowSizeChange.bind(this);

	}
	componentWillReceiveProps(nextProps) {
		const np = {};
		if (nextProps.rowSelection && nextProps.rowSelection.selected) {
			np.selected = nextProps.rowSelection.selected;
		}
		// pagination 外层受控/非受控，内部构造受控组件
		if (nextProps.pagination) {
			if (nextProps.pagination.current) {
				np.current = nextProps.pagination.current;
			}
			if (nextProps.pagination.pageSize) {
				np.pageSize = nextProps.pagination.pageSize;
			}
		}
		this.setState(np);
	}
	onPaginationChange(current, pageSize) {
		const pagination = this.props.pagination;
		if (current != pagination.current) {
			this.setState({
				current,
				pageSize,
				selected: {},
			});
			if (this.props.rowSelection && this.props.rowSelection.onChange) {
				this.props.rowSelection.onChange({});
			}
		}
		if (pagination && pagination.onChange) {
			pagination.onChange(current, pageSize);
		}
	}
	onPaginationShowSizeChange(current, pageSize) {
		const pagination = this.props.pagination;
		if (pageSize != pagination.pageSize) {
			this.setState({
				current,
				pageSize,
				selected: {},
			});
			if (this.props.rowSelection && this.props.rowSelection.onChange) {
				this.props.rowSelection.onChange({});
			}
		}
		if (pagination.onShowSizeChange) {
			pagination.onShowSizeChange(current, pageSize);
		}
	}
	onCheckChange(data, e) {
		e.stopPropagation();
		const propsSltd = this.props.rowSelection.selected;
		const selected = propsSltd || this.state.selected;
		const id = this.props.idProperty;
		const checked = e.target.checked;
		let result = this.state.selected;
		if (data === 'all') {
			if (checked) {
				const dataSource = pageChunk(this.props.dataSource, this.state.pageSize, this.state.current);
				dataSource.forEach((val) => {
					result[val[id]] = val;
				});
			} else {
				result = {};
			}
		} else {
			if (checked) {
				result[data[id]] = data;
			} else {
				result = selected;
				delete result[data[id]];
			}
		}

		if (!propsSltd) {
			this.setState({
				selected: result,
			});
		}
		if (this.props.rowSelection.onChange) {
			this.props.rowSelection.onChange(result);
		}
	}
	onRadioChange(data, e) {
		e.stopPropagation();
		const propsSltd = this.props.rowSelection.selected;
		const id = this.props.idProperty;
		const selection = {
			[data[id]]: data,
		};
		if (!propsSltd) {
			this.setState({
				selected: selection,
			});
		}
		if (this.props.rowSelection.onChange) {
			this.props.rowSelection.onChange(selection);
		}
	}
	onSelectionChange(newSelection) {
		console.info('row selection:', newSelection);
		let ns = this.state.selected;
		if (this.props.rowSelection.type === 'radio') {
			ns = newSelection;
		} else {
			Object.keys(newSelection).forEach((key) => {
				if (ns[key]) {
					delete ns[key];
				} else {
					ns[key] = newSelection[key];
				}
			})
		}

		const propsSltd = this.props.rowSelection.selected;
		if (!propsSltd) {
			this.setState({
				selected: ns,
			});
		}
		if (this.props.rowSelection.onChange) {
			this.props.rowSelection.onChange(ns);
		}
	}
	initSelection() {
		const { type, getCheckboxProps } = this.props.rowSelection;
		const id = this.props.idProperty;
		const checkboxProps = getCheckboxProps || void0;
		const result = this.props.columns;
		// 浅拷贝columns
		const pageData = pageChunk(this.props.dataSource, this.state.pageSize, this.state.current);
		const checkedAll = pageData.filter((data) => this.state.selected[data.id]).length === pageData.length;
		if (result[0].name !== '__checkCol') {
			result.unshift({
				title: type === 'radio' ? '单选' :
					<Checkbox
						key="selectAll"
						onChange={this.onCheckChange.bind(this, 'all')}
						checked={checkedAll}
						{...checkboxProps({})}
					/>,
				name: '__checkCol',
				width: 45,
				render: (value, data, cellProps) => {
					if (type === 'radio') {
						return <Radio
							checked={!!this.state.selected[data[id]]}
						/>
					}
					return <div onClick={(e) => e.stopPropagation()}>
						<p>{data.rowIndex + 1}</p>
						<Checkbox
							key={data[id]}
							checked={!!this.state.selected[data[id]]}
							onChange={this.onCheckChange.bind(this, data)}
							{...checkboxProps(data)}
						/>
					</div>
				},
			});
			return result;
		}
		return result;
	}
	clearReactDataGridProps(props, rowSelection) {
		const result = { ...props };
		delete result.pagination;
		delete result.selected;
		delete result.onSelectionChange;
		if (rowSelection) {
			result.columns = this.initSelection();
			result.selected = this.state.selected;
			result.onSelectionChange = this.onSelectionChange;
		}
		return result;
	}
	render() {
		const { pagination, rowSelection, footer, ...restProps } = this.props;
		// 清除需要被覆盖的字段
		this.state.gridProps = this.clearReactDataGridProps(restProps, rowSelection);
		// dataSource需要被继承并修改
		return (<div className="lt-table-wrapper">
			<DataGrid
				{...this.state.gridProps}
				pagination={false}
				dataSource={pageChunk(this.state.gridProps.dataSource, this.state.pageSize, this.state.current)}
			/>
			{
				(footer || pagination) &&
					<div className="lt-table-footer">
					{
						footer &&
							<div className="lt-table-footer-content">
								{footer}
							</div>
					}
					{
						pagination &&
							<div className="lt-table-pagination">
								{<Pagination
									{...pagination}
									onChange={this.onPaginationChange}
									onShowSizeChange={this.onPaginationShowSizeChange}
									current={this.state.current}
									pageSize={this.state.pageSize}
								/>}
							</div>
					}
					</div>
			}

		</div>);
	}
}

Table.defaultProps = {
	idProperty: 'id',
	// rowSelection: {
	// 	type: 'checkbox',
	// 	selectedRowKeys: [],
	// 	onChange: function onChange(selectedRowKeys, selectedRows) {
	// 	},
	// 	getCheckboxProps: function getCheckboxProps(argument) {
	// 		return {};
	// 	},
	// 	onSelect: function onSelect(record, selected, selectedRows) {
	// 	},
	// 	onSelectAll: function onSelectAll(selected, selectedRows, changeRows) {
	// 	},
	// },
	// pagination: {
	// 	current: 1,
	// 	defaultCurrent: 1,
	// 	total: 0,
	// 	defaultPageSize: 20,
	// 	pageSize: 20,
	// 	onChange: function onChange(page, pageSize) {

	// 	},
	// 	showSizeChanger: false,
	// 	pageSizeOptions: [10, 20, 30, 40],
	// 	onShowSizeChange: function onShowSizeChange(current, size) {

	// 	},
	// 	showQuickJumper: false,
	// 	size: 'small',
	// 	simple: {},
	// 	showTotal: function showTotal(total, range) {
	// 		// body...
	// 	},
	// },
}

Table.propTypes = {
	pagination: React.PropTypes.shape({
		current: React.PropTypes.number,
		defaultCurrent: React.PropTypes.number,
		total: React.PropTypes.number,
		defaultPageSize: React.PropTypes.number,
		pageSize: React.PropTypes.number,
		onChange: React.PropTypes.func,
		showSizeChanger: React.PropTypes.bool,
		pageSizeOptions: React.PropTypes.arrayOf(React.PropTypes.number),
		onShowSizeChange: React.PropTypes.func,
		showQuickJumper: React.PropTypes.bool,
		size: React.PropTypes.string,
		simple: React.PropTypes.object,
		showTotal: React.PropTypes.func,
	}),
	rowSelection: React.PropTypes.shape({
		type: React.PropTypes.oneOf(['checkbox', 'radio']),
		selected: React.PropTypes.object,
		onChange: React.PropTypes.func,
		getCheckboxProps: React.PropTypes.func,
		// 后两者暂时没有调用
		onSelect: React.PropTypes.func,
		onSelectAll: React.PropTypes.func,
	}),
}


export default Table;
