import {
    CompletionItem,
    CompletionItemKind,
    TextEdit,
} from 'vscode';

import * as vscode from 'vscode';

export const ifChannelStoreCompletionItems: CompletionItem[] = [
    {
        kind: CompletionItemKind.Method,
        label: 'GetIdentity',
        insertText: new vscode.SnippetString('GetIdentity()'),
        detail: 'GetIdentity() as Integer',
        documentation: new vscode.MarkdownString(
`
Returns a unique number for this object that can be used to identify whether a roChannelStoreEvent event originated from this object,
by comparing with the roChannelStoreEvent object's GetSourceIdentity() value.

Note that the value can be any arbitrary value as assigned by the firmware, and should only be used for comparison purposes.
For example, the value should not be used as an array index.
For use as a look-up key, one option would be to use GetIdentity().ToStr() as an associative array key.

_This function is available in firmware 7.5 or later._
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetCatalog',
        insertText: new vscode.SnippetString('GetCatalog()'),
        detail: 'GetCatalog() as Void',
        documentation: new vscode.MarkdownString(
`
Requests the list of In-Channel products which are linked to the running channel.

If successful, a later roChannelStoreEvent will be received which contains an roList of roAssociativeArray items where each item contains the following parameter names with specified value type:

* String code
* String name
* String description
* String SDPosterUrl
* String HDPosterUrl
* String cost (Localized cost with local currency symbol)
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetStoreCatalog',
        insertText: new vscode.SnippetString('GetStoreCatalog()'),
        detail: 'GetStoreCatalog() as Void',
        documentation: new vscode.MarkdownString(
`
Requests the list of globally available In-Channel products, which are available to all channels.

If successful, a later roChannelStoreEvent will be received which contains an roList of roAssociativeArray items, where each item contains the following parameter names with specified value type:

* String code
* String name
* String description
* String SDPosterUrl
* String HDPosterUrl
* String cost (Localized cost with local currency symbol)
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetPurchases',
        insertText: new vscode.SnippetString('GetPurchases()'),
        detail: 'GetPurchases() as Void',
        documentation: new vscode.MarkdownString(
`
Requests the list of purchases associated with the current user account.

If successful, a later roChannelStoreEvent will be received which contains an roList of roAssociativeArray items, where each item contains the following parameter names with specified value type:

Parameter | Type | Description
--- | --- | ---
code | String | The product identifier
cost | String | Localized cost of the item with local currency symbol
expirationDate | String | The subscription expiration date (ISO 8601 format)
freeTrialQuantity | Integer | The free trial amount associated with the freeTrialType
freeTrialType | String | The free trial type ("Days" or "Months")
name | String | The item name
productType | String | The product type (ex. "MonthlySub")
purchaseDate | String | The purchase date (ISO 8601 format)
purchaseId | String | The transaction ID
qty | Integer | The quantity purchased
renewalDate | String | The subscription renewal date (ISO 8601 format)
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'SetOrder',
        insertText: new vscode.SnippetString('SetOrder(${1:order as Object})'),
        detail: 'SetOrder(order as Object) as Void',
        documentation: new vscode.MarkdownString(
`
Sets the current Order (shopping cart) to the elements specified in the parameter, which must be an roList of roAssociativeArray items,
where each item contains the following parameter names with specified value type:

* String code
* Integer qty

Passing an empty roList clears the Order, like calling ClearOrder().
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'ClearOrder',
        insertText: new vscode.SnippetString('ClearOrder()'),
        detail: 'ClearOrder() as Void',
        documentation: new vscode.MarkdownString(
`
Clears the current Order (shopping cart). After this call, the Order is empty.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'DeltaOrder',
        insertText: new vscode.SnippetString('DeltaOrder(${1:code as Object}, ${2:qty as Integer})'),
        detail: 'DeltaOrder(code as Object, qty as Integer) as Integer',
        documentation: new vscode.MarkdownString(
`
Applies a change in quantity to one item in the current Order (shopping cart). If the item identified by code is not in the Order, it is added with the specified quantity.
If the item already exists in the Order, qty is added to the quantity of this item in the Order. qty may be negative.
The returned value is the quantity of the item remaining in the Order after applying the change. If this number is zero or negative, the item is deleted from the Order.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetOrder',
        insertText: new vscode.SnippetString('GetOrder()'),
        detail: 'GetOrder() as Object',
        documentation: new vscode.MarkdownString(
`
Retrieves the current Order. The returned object is an roList of roAssociativeArray items, where each item contains the following parameter names with specified value type:

* String code
* Integer qty
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'DoOrder',
        insertText: new vscode.SnippetString('DoOrder()'),
        detail: 'DoOrder() as Boolean',
        documentation: new vscode.MarkdownString(
`
Displays the Roku Channel Store Product Purchase Screen populated with information from the current Order.
The user can then either approve and complete the purchase, or cancel the purchase. If the user approves the order, this function returns true.
Otherwise it returns false. In the case that  the user approves,
the channel should wait for and respond to the roChannelStoreEvent.isRequestSucceeded event to get the details of the completed transaction.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'FakeServer',
        insertText: new vscode.SnippetString('FakeServer(${1:enable as Boolean})'),
        detail: 'FakeServer(enable as Boolean) as Void',
        documentation: new vscode.MarkdownString(
`
If enable is true, enables a test mode for the roChannelStore component.
This test mode short circuits communication to the Roku Channel store.
It makes other methods get their responses to async queries and operations from configuration files, rather than actual server communication.

This should never be called in a production channel.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetUserData',
        insertText: new vscode.SnippetString('GetUserData()'),
        detail: 'GetUserData() as Dynamic',
        documentation: new vscode.MarkdownString(
`
When called, the method presents a dialog screen containing the user’s account information, along with two buttons labeled Share and Don’t Share.
If the user presses the Don’t Share button, GetUserData() returns invalid. If the user presses the Share button,
GetUserData() returns an roAssociativeArray containing the following Roku account information for the channel user. All values are Strings.

* firstname
* lastname
* email
* street1
* street2
* city
* state
* zip
* country
* phone
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetPartialUserData',
        insertText: new vscode.SnippetString('GetPartialUserData(${1:properties as String})'),
        detail: 'GetPartialUserData(properties as String) as Dynamic',
        documentation: new vscode.MarkdownString(
`
This function works like GetUserData(), but allows the caller to specify which user data elements to return.
The specified values are also displayed in the user data dialog screen. To tell the function which properties to return, pass a string with a comma separated list of the attribute names.
For example, to return only the email address and first name of the user's account, you would call GetPartialUserData("email, firstname").
The full set of user account properties that can be queried with the function is:

* firstname
* lastname
* email
* street
* city
* state
* zip
* country
* phone
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'StoreChannelCredData',
        insertText: new vscode.SnippetString('StoreChannelCredData(${1:data as String})'),
        detail: 'StoreChannelCredData(data as String) as Object',
        documentation: new vscode.MarkdownString(
`
_Available since firmware version 8.1_

This method can be used to store custom data (such as an OAuth token or a custom token) that can be retrieved by calling GetChannelCred.
This data is stored securely in the cloud and can be retrieved by other devices linked to the same Roku account.
Your channel can use the Roku StoreChannelCredData method to store an authentication artifact with Roku for a signed in user,
associating that user with a particular Roku account. For more information, see Universal Authentication Protocol for Single Sign-On.

If the transaction is successful, an roAssociativeArray will be returned containing the following value:

Key | Type | Value
--- | --- | ---
status | Integer | An integer representing the request status. A successful request will return a status of 0

If the transaction failed, the roAssociativeArray will contain the following value:

Key | Type | Value
--- | --- | ---
errorCode | String | An error code representing why the transaction failed.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'GetChannelCred',
        insertText: new vscode.SnippetString('GetChannelCred()'),
        detail: 'GetChannelCred() as Object',
        documentation: new vscode.MarkdownString(
`
_Available since firmware version 7.2_

This function can be used to retrieve a Roku Partner Unique Customer Identifier (roku_pucid).
The PUCID can be used in place of requiring the user to enter their email address or username again (ex. when setting up a new device on the same Roku account).

It returns an roAssociativeArray containing the following values:

Key | Type | Description
--- | --- | ---
channelID | String | A string representing the channel ID
json | String | A string in JSON format with the following key values: error as String, roku_pucid as String, token_type as String. If the request fails this _json_ string will be empty.
publisherDeviceID | String | A unique identifier of the device. See GetPublisherId() for more details.
status | Integer | An integer representing the request status. A successful request will return a status of 0.
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'RequestPartnerOrder',
        insertText: new vscode.SnippetString('RequestPartnerOrder(${1:orderInfo as Object}, ${2:productID as String})'),
        detail: 'RequestPartnerOrder(orderInfo as Object, productID as String) as Object',
        documentation: new vscode.MarkdownString(
`
_Available since firmware version 7.6_

This function checks the user's billing status and is a prerequisite for ConfirmPartnerOrder() when doing transactional purchases. This function requires the following parameters:

Key | Type | Description
--- | --- | ---
orderInfo | Object | An roAssociativeArray that contains two String key-value pairs: priceDisplay as String, price as String.
productID | String | The product identifier as entered on the Developer Dashboard when the product was created.

This function returns an roAssociativeArray containing the following values:

Key | Type | Description
--- | --- | ---
id | String | This ID must be passed in the confirmOrderInfo parameter in ConfirmPartnerOrder()
status | String | Success
tax | String | Cost of tax (if applicable)
total | String | Total cost of transaction

If status is Failure, the roAssociativeArray will contain the following values:

Key | Type | Description
--- | --- | ---
errorCode | String | An error code representing why the transaction failed
errorMessage | String | An error message explaining why the transaction failed
status | String | Failure
`
        )
    },
    {
        kind: CompletionItemKind.Method,
        label: 'ConfirmPartnerOrder',
        insertText: new vscode.SnippetString('ConfirmPartnerOrder(${1:confirmOrderInfo as Object}, ${2:productID as String})'),
        detail: 'ConfirmPartnerOrder(confirmOrderInfo as Object, productID as String) as Object',
        documentation: new vscode.MarkdownString(
`
_Available since firmware version 7.6_

This function is equivalent to doOrder() for transactional purchases.
The user's billing status must first be confirmed with RequestPartnerOrder() prior to calling this function.
productID is the product identifier as entered on the Developer Dashboard when the product was created. confirmOrderInfo is an roAssociativeArray with the following info:

Key | Type | Description
--- | --- | ---
title | String | The name of the content item (shown on user's invoice)
priceDisplay | String | The original price displayed
price | String | The price to charge
orderID | String | The ID returned from RequestPartnerOrder()

_Note: The currency symbol must not be included for price and priceDisplay_

If the transaction is successful, an roAssociativeArray will be returned containing the following values:

Key | Type | Description
--- | --- | ---
purchaseID | String | The transaction ID
status | String | Success

If the transaction failed, the roAssociativeArray will contain the following values:

Key | Type | Description
--- | --- | ---
errorCode | String | An error code representing why the transaction failed
errorMessage | String | An error message explaining why the transaction failed
status | String | Failure
`
        )
    },
];
