/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IContextViewProvider } from '../../../../base/browser/ui/contextview/contextview.js';
import { IFindInputOptions } from '../../../../base/browser/ui/findinput/findInput.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { ContextScopedFindInput } from '../../../../platform/history/browser/contextScopedHistoryWidget.js';

export class SearchFindInput extends ContextScopedFindInput {
	constructor(
		container: HTMLElement | null,
		contextViewProvider: IContextViewProvider,
		options: IFindInputOptions,
		contextKeyService: IContextKeyService,
	) {
		super(container, contextViewProvider, options, contextKeyService);
	}
}
