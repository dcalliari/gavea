/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IDisposable } from '../../../base/common/lifecycle.js';
import { MainContext } from '../common/extHost.protocol.js';
import { extHostNamedCustomer, IExtHostContext } from '../../services/extensions/common/extHostCustomers.js';
import type { ProxyIdentifier } from '../../services/extensions/common/proxyIdentifier.js';

@extHostNamedCustomer(MainContext.MainThreadDebugService as ProxyIdentifier<IDisposable>)
export class DisabledMainThreadDebugService implements IDisposable {
	constructor(_context: IExtHostContext) { }

	dispose(): void { }
}
