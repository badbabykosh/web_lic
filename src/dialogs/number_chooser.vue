/* Web Lic - Copyright (C) 2018 Remi Gagne */

<template>
	<licDialog
		:title="title"
		:width="width"
	>
		<el-form onSubmit="return false;">
			<el-form-item :label="label" class="number_chooser_input">
				<input
					ref="set_focus"
					v-model.number="value"
					:min="min"
					:max="max"
					:step="step"
					type="number"
					class="form-control"
					@input="updateValues"
				>
				<div v-if="bodyText" style="margin-top: 15px" v-html="bodyText" />
			</el-form-item>
		</el-form>
		<span slot="footer" class="dialog-footer">
			<el-button @click="cancel">{{tr("dialog.cancel")}}</el-button>
			<el-button type="primary" @click="ok">{{tr("dialog.ok")}}</el-button>
		</span>
	</licDialog>
</template>

<script>

// TODO: Need to implement my own better looking number input, with nice scroll buttons.
export default {
	data: function() {
		return {
			value: null,
			title: '',
			label: '',
			width: '500px',
			bodyText: '',
			min: 0,
			max: 100,
			step: 1
		};
	},
	methods: {
		updateValues() {
			this.$emit('update', {...this.$data});
		},
		ok() {
			this.$emit('ok', {...this.$data});
			this.$emit('close');
		},
		cancel() {
			this.$emit('cancel');
			this.$emit('close');
		}
	}
};
</script>

<style>

.number_chooser_input {
	display: flex;
}

.number_chooser_input .el-form-item__content {
	display: inline-block;
	padding-top: 3px;
	flex-grow: 1;
}

</style>
